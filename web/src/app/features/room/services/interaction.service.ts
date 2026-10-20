import { DestroyRef, Injectable, computed, signal, inject } from '@angular/core';
import { SocketService } from '@core/socket/socket.service';
import {
  GameEvents,
  NUDGE_TARGET_COOLDOWN_MS,
  NudgeEventSchema,
  ProjectileEventSchema,
  ProjectileBarrageSchema,
} from '@poker/shared';

import type { NudgeEvent, ProjectileEvent as Projectile } from '@poker/shared';

@Injectable({
  providedIn: 'root',
})
export class InteractionService {
  private socketService = inject(SocketService);
  private destroyRef = inject(DestroyRef);
  private readonly timeoutIds = new Set<ReturnType<typeof setTimeout>>();

  nudgedUserId = signal<string | null>(null);
  /** The newest nudge in the room; seq changes even when the same person is nudged again. */
  readonly lastNudge = signal<{ readonly event: NudgeEvent; readonly seq: number } | null>(null);
  private nudgeSeq = 0;
  /** When each recently nudged player can be nudged again, by local receipt time. */
  private readonly nudgeReadyAt = signal<ReadonlyMap<string, number>>(new Map());
  private readonly clock = signal(Date.now());
  private cooldownTicker: ReturnType<typeof setInterval> | null = null;
  /**
   * Whole seconds until each player can be nudged again. The server drops nudges
   * during this window, so the UI shows a countdown instead of a dead button.
   */
  readonly nudgeCooldowns = computed(() => {
    const now = this.clock();
    const seconds = new Map<string, number>();
    for (const [userId, readyAt] of this.nudgeReadyAt()) {
      if (readyAt > now) seconds.set(userId, Math.ceil((readyAt - now) / 1000));
    }
    return seconds;
  });
  thrownProjectiles = signal<Projectile[]>([]);

  constructor() {
    this.destroyRef.onDestroy(() => {
      for (const timeoutId of this.timeoutIds) {
        clearTimeout(timeoutId);
      }
      this.timeoutIds.clear();
      this.stopCooldownTicker();
    });
    this.initListeners();
  }

  private setTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
    const timeoutId = setTimeout(() => {
      this.timeoutIds.delete(timeoutId);
      callback();
    }, delay);
    this.timeoutIds.add(timeoutId);
    return timeoutId;
  }

  private startNudgeCooldown(userId: string): void {
    const now = Date.now();
    this.clock.set(now);
    this.nudgeReadyAt.update((current) => {
      const next = new Map([...current].filter(([, readyAt]) => readyAt > now));
      next.set(userId, now + NUDGE_TARGET_COOLDOWN_MS);
      return next;
    });
    this.cooldownTicker ??= setInterval(() => {
      const tick = Date.now();
      this.clock.set(tick);
      if ([...this.nudgeReadyAt().values()].every((readyAt) => readyAt <= tick)) {
        this.nudgeReadyAt.set(new Map());
        this.stopCooldownTicker();
      }
    }, 250);
  }

  private stopCooldownTicker(): void {
    if (this.cooldownTicker === null) return;
    clearInterval(this.cooldownTicker);
    this.cooldownTicker = null;
  }

  nudge(userId: string): void {
    this.socketService.nudge(userId);
  }

  nudgeStragglers(): void {
    this.socketService.nudgeStragglers();
  }

  throwProjectile(targetUserId: string, emoji: string): void {
    this.socketService.throwProjectile(targetUserId, emoji);
  }

  private initListeners(): void {
    const socket = this.socketService.getSocket();
    const listen = (event: string, listener: (payload: unknown) => void) => {
      socket.on(event, listener);
      this.destroyRef.onDestroy(() => socket.off(event, listener));
    };

    listen(GameEvents.NUDGED, (payload: unknown) => {
      const parsed = NudgeEventSchema.safeParse(payload);
      if (!parsed.success) return;
      const data = parsed.data;
      this.lastNudge.set({ event: data, seq: ++this.nudgeSeq });
      this.nudgedUserId.set(data.targetUserId);
      this.startNudgeCooldown(data.targetUserId);
      this.setTimer(() => {
        if (this.nudgedUserId() === data.targetUserId) {
          this.nudgedUserId.set(null);
        }
      }, 3000);
    });

    listen(GameEvents.PROJECTILE_THROWN, (payload: unknown) => {
      const parsed = ProjectileEventSchema.safeParse(payload);
      if (!parsed.success) return;
      const data = parsed.data;
      const proj: Projectile = data;

      this.thrownProjectiles.update((projs) => {
        const next = [...projs, proj];
        if (next.length > 20) return next.slice(next.length - 20);
        return next;
      });

      // Remove projectile after 3 seconds
      this.setTimer(() => {
        this.thrownProjectiles.update((projs) => projs.filter((p) => p.id !== data.id));
      }, 3000);
    });

    listen(GameEvents.PROJECTILE_BARRAGE, (payload: unknown) => {
      const parsed = ProjectileBarrageSchema.safeParse(payload);
      if (!parsed.success) return;
      const data = parsed.data;
      this.spawnBarrage(data.targetUserId, data.emoji, data.sourceUserId);
    });
  }

  private spawnBarrage(targetUserId: string, emoji: string, sourceUserId: string): void {
    const count = 20;
    const duration = 1500; // Spread over 1.5 seconds

    for (let i = 0; i < count; i++) {
      const delay = Math.random() * duration;

      this.setTimer(() => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const side = Math.random() > 0.5 ? 'left' : 'right';
        const startX = side === 'left' ? -(300 + Math.random() * 200) : 300 + Math.random() * 200;
        const startY = Math.floor(Math.random() * 120) - 60;

        const proj: Projectile = {
          id,
          sourceUserId,
          targetUserId,
          emoji,
          side,
          offsetX: Math.floor(Math.random() * 80) - 40,
          offsetY: Math.floor(Math.random() * 40) + 60,
          rotation: Math.floor(Math.random() * 360),
          startX,
          startY,
        };

        this.thrownProjectiles.update((projs) => {
          const next = [...projs, proj];
          if (next.length > 50) return next.slice(next.length - 50);
          return next;
        });

        // Remove each piece after 3 seconds from ITS spawn time
        this.setTimer(() => {
          this.thrownProjectiles.update((projs) => projs.filter((p) => p.id !== id));
        }, 3000);
      }, delay);
    }
  }
}
