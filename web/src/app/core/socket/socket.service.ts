import { initializeSecureSession } from '../session/secure-session';
import { DestroyRef, inject, Injectable } from '@angular/core';
import { NavigationEnd, PRIMARY_OUTLET, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { io, Socket } from 'socket.io-client';
import { GameEvents, SocketEvents, JoinedSchema, PublicUserSchema } from '@poker/shared';
import type { ReplayProtectionMetadata, RoomMood } from '@poker/shared';
import { USER_NAME_STORAGE_KEY } from '../storage/storage-keys';
import { resolveApiUrl } from '../api/api-url';
import { SiteConfigService } from '../config/site-config.service';

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private readonly socket: Socket;
  private readonly sessionAbort = new AbortController();
  private readonly siteConfig = inject(SiteConfigService);

  getApiUrl(): string {
    return resolveApiUrl();
  }

  private apiUrl = this.getApiUrl();

  private currentRoomId: string | null = null;
  private currentUserName: string | null = null;
  private currentCreateRoomIntent = false;
  private lastJoinedKey: string | null = null;
  private connectionNonce: string | null = null;
  private clientSeq = 0;

  constructor() {
    this.socket = io(this.apiUrl, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 20000,
      withCredentials: true, // Send the secure HttpOnly cookie
      autoConnect: false, // Don't connect until session is initialized
    });

    this.socket.on('connect', () => {
      this.lastJoinedKey = null;
      this.connectionNonce = null;
      this.clientSeq = 0;
      if (this.currentRoomId && this.currentUserName) {
        this.emitJoinRoom(this.currentRoomId, this.currentUserName, this.currentCreateRoomIntent);
      }
    });

    this.socket.on(GameEvents.JOINED, (payload: unknown) => {
      const parsed = JoinedSchema.safeParse(payload);
      if (!parsed.success) return;
      this.connectionNonce = parsed.data.connectionNonce;
      this.clientSeq = 0;
      this.lastJoinedKey = this.getJoinKey(
        this.currentRoomId,
        this.currentUserName,
        this.currentCreateRoomIntent,
      );
    });

    // Keep a rename only once the server accepts it, so a refused name is not reused on reconnect.
    this.socket.on(GameEvents.USER_UPDATED, (payload: unknown) => {
      const parsed = PublicUserSchema.safeParse(payload);
      if (!parsed.success) return;
      this.currentUserName = parsed.data.name;
      localStorage.setItem(USER_NAME_STORAGE_KEY, parsed.data.name);
    });

    const router = inject(Router);
    router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (!(event instanceof NavigationEnd) || !this.currentRoomId) return;
      const url = router.parseUrl(event.urlAfterRedirects);
      const segments =
        url.root.children[PRIMARY_OUTLET]?.segments.map((segment) => segment.path) ?? [];
      const isRoomPage =
        segments[0] === 'room' &&
        this.isInRoom(segments[1] ?? '') &&
        (segments.length === 2 || (segments.length === 3 && segments[2] === 'stats'));
      const from: unknown = url.queryParams['from'];
      const isRoomFeedback =
        segments.length === 1 &&
        segments[0] === 'feedback' &&
        typeof from === 'string' &&
        this.isInRoom(from);
      if (!isRoomPage && !isRoomFeedback) this.leaveRoom();
    });

    inject(DestroyRef).onDestroy(() => {
      this.sessionAbort.abort();
      this.socket.disconnect();
    });
    void initializeSecureSession(
      this.apiUrl,
      () => this.socket.connect(),
      this.sessionAbort.signal,
    );
  }

  getSocket(): Socket {
    return this.socket;
  }

  isInRoom(roomId: string): boolean {
    return this.currentRoomId?.toLowerCase() === roomId.toLowerCase();
  }

  joinRoom(roomId: string, userName: string, createRoomIntent = false) {
    const roomChanged = this.currentRoomId?.toLowerCase() !== roomId.toLowerCase();
    if (roomChanged && this.currentRoomId) this.leaveRoom();
    this.currentRoomId = roomId;
    this.currentUserName = userName;
    this.currentCreateRoomIntent = createRoomIntent;

    // If the socket is not yet connected, the 'connect' listener in the constructor
    // will handle the initial join once the connection is established.
    // If we emit now while disconnected, socket.io buffers it and sends it upon
    // connection, leading to a duplicate JOIN_ROOM event (buffer + connect handler).
    if (this.socket.connected) {
      const joinKey = this.getJoinKey(roomId, userName, createRoomIntent);
      if (this.lastJoinedKey === joinKey) return;
      this.emitJoinRoom(roomId, userName, createRoomIntent);
    }
  }

  private getJoinKey(
    roomId: string | null,
    userName: string | null,
    createRoomIntent = false,
  ): string | null {
    if (!roomId || !userName) return null;
    return `${roomId.toLowerCase()}:${userName}:${createRoomIntent}`;
  }

  private emitJoinRoom(roomId: string, userName: string, createRoomIntent = false) {
    // visitorId is sent via socket handshake auth — not in the payload
    const siteAgreement = this.siteConfig.agreementAcceptance();
    this.socket.emit(SocketEvents.JOIN_ROOM, {
      roomId,
      userName,
      createRoomIntent,
      ...(siteAgreement ? { siteAgreement } : {}),
    });
  }

  private emitProtected(event: SocketEvents, payload: Record<string, unknown> = {}) {
    if (!this.socket.connected || !this.connectionNonce) return;

    const meta: ReplayProtectionMetadata = {
      connectionNonce: this.connectionNonce,
      clientSeq: ++this.clientSeq,
    };
    this.socket.emit(event, { ...payload, _meta: meta });
  }

  vote(vote: string | null) {
    this.emitProtected(SocketEvents.VOTE, { vote });
  }

  reveal() {
    this.emitProtected(SocketEvents.REVEAL);
  }

  reset() {
    this.emitProtected(SocketEvents.RESET);
  }

  updateRoomName(name: string) {
    this.emitProtected(SocketEvents.UPDATE_ROOM_NAME, { name });
  }

  updateUser(name: string) {
    this.emitProtected(SocketEvents.UPDATE_USER, { name });
  }

  leaveRoom() {
    this.socket.emit(SocketEvents.LEAVE_ROOM);
    this.currentRoomId = null;
    this.currentUserName = null;
    this.lastJoinedKey = null;
    this.connectionNonce = null;
    this.clientSeq = 0;
  }

  toggleAutoReveal(autoReveal: boolean) {
    this.emitProtected(SocketEvents.TOGGLE_AUTO_REVEAL, { autoReveal });
  }

  toggleObserver(isObserver: boolean) {
    this.emitProtected(SocketEvents.TOGGLE_OBSERVER, { isObserver });
  }

  toggleIssues(issuesEnabled: boolean) {
    this.emitProtected(SocketEvents.TOGGLE_ISSUES, { issuesEnabled });
  }

  updateRoomMood(mood: RoomMood) {
    this.emitProtected(SocketEvents.UPDATE_ROOM_MOOD, { mood });
  }

  approveUser(userId: string) {
    this.emitProtected(SocketEvents.APPROVE_USER, { userId });
  }

  denyUser(userId: string) {
    this.emitProtected(SocketEvents.DENY_USER, { userId });
  }

  updateMultiplier(useMultiplier: boolean, multiplierValue: number) {
    this.emitProtected(SocketEvents.UPDATE_MULTIPLIER, { useMultiplier, multiplierValue });
  }

  nudge(targetUserId: string) {
    this.emitProtected(SocketEvents.NUDGE, { targetUserId });
  }

  nudgeStragglers() {
    this.emitProtected(SocketEvents.NUDGE_STRAGGLERS, {});
  }

  throwProjectile(targetUserId: string, emoji: string) {
    this.emitProtected(SocketEvents.THROW_PROJECTILE, { targetUserId, emoji });
  }

  barrageProjectile(targetUserId: string, emoji: string) {
    this.emitProtected(SocketEvents.BARRAGE_PROJECTILE, { targetUserId, emoji });
  }

  checkHealth() {
    this.socket.emit(SocketEvents.CHECK_HEALTH);
  }

  updateTheme(theme: string) {
    this.emitProtected(SocketEvents.UPDATE_THEME, { theme });
  }
}
