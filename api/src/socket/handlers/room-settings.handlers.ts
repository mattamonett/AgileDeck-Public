import { onMemberEvent } from '../member-event';
import {
  GameEvents,
  ToggleIssuesSchema,
  SocketEvents,
  UpdateRoomNameSchema,
  ToggleAutoRevealSchema,
  UpdateMultiplierSchema,
  UpdateThemeSchema,
  UpdateRoomMoodSchema,
  isMoodAllowed,
  isThemeAllowed,
} from '@poker/shared';
import { getSiteConfig } from '../../config/site-config';
import { sanitize } from '../sanitize';
import * as RoomService from '../../modules/rooms/room.service';

import { getAuthorizedData } from '../authorization';
import type { PokerSocket } from '../types';
import { logger } from '../../platform/logger';

/** Minimum time between one member's repeats of each action. */
const UPDATE_ROOM_MOOD_COOLDOWN_MS = 500;
const UPDATE_ROOM_NAME_COOLDOWN_MS = 2000;
const TOGGLE_AUTO_REVEAL_COOLDOWN_MS = 1500;
const UPDATE_MULTIPLIER_COOLDOWN_MS = 1500;
const UPDATE_THEME_COOLDOWN_MS = 500;
const TOGGLE_ISSUES_COOLDOWN_MS = 500;

export function registerRoomSettingsHandlers(socket: PokerSocket): void {
  onMemberEvent(socket, SocketEvents.UPDATE_ROOM_MOOD, async (payload: unknown) => {
    const auth = await getAuthorizedData(
      socket,
      UPDATE_ROOM_MOOD_COOLDOWN_MS,
      SocketEvents.UPDATE_ROOM_MOOD,
    );
    if (!auth) return;
    const parsed = UpdateRoomMoodSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit(GameEvents.ERROR, 'Invalid room mood');
      return;
    }
    if (!isMoodAllowed(parsed.data.mood, getSiteConfig().content)) {
      socket.emit(GameEvents.ERROR, 'That mood is not available on this site');
      return;
    }
    try {
      await RoomService.updateRoom(auth.roomId, { mood: parsed.data.mood });
    } catch (error) {
      logger.error('Error updating room mood:', error);
      socket.emit(GameEvents.ERROR, 'Unable to update room mood');
    }
  });
  onMemberEvent(socket, SocketEvents.UPDATE_ROOM_NAME, async (payload: unknown) => {
    const auth = await getAuthorizedData(
      socket,
      UPDATE_ROOM_NAME_COOLDOWN_MS,
      SocketEvents.UPDATE_ROOM_NAME,
    );
    if (!auth) return;
    const { roomId } = auth;

    const validation = UpdateRoomNameSchema.safeParse(payload);
    if (!validation.success) {
      socket.emit(GameEvents.ERROR, validation.error.issues[0]?.message || 'Invalid payload');
      return;
    }

    try {
      await RoomService.updateRoom(roomId, { name: validation.data.name });
    } catch (e) {
      logger.error('Error updating room name:', e);
    }
  });

  onMemberEvent(socket, SocketEvents.TOGGLE_AUTO_REVEAL, async (payload: unknown) => {
    const auth = await getAuthorizedData(
      socket,
      TOGGLE_AUTO_REVEAL_COOLDOWN_MS,
      SocketEvents.TOGGLE_AUTO_REVEAL,
    );
    if (!auth) return;
    const { roomId } = auth;

    const validation = ToggleAutoRevealSchema.safeParse(payload);
    if (!validation.success) {
      socket.emit(GameEvents.ERROR, validation.error.issues[0]?.message || 'Invalid payload');
      return;
    }

    try {
      await RoomService.toggleAutoReveal(roomId, validation.data.autoReveal);
    } catch (e) {
      logger.error('Error toggling auto-reveal:', e);
    }
  });

  onMemberEvent(socket, SocketEvents.UPDATE_MULTIPLIER, async (payload: unknown) => {
    const auth = await getAuthorizedData(
      socket,
      UPDATE_MULTIPLIER_COOLDOWN_MS,
      SocketEvents.UPDATE_MULTIPLIER,
    );
    if (!auth) return;
    const { roomId } = auth;

    const validation = UpdateMultiplierSchema.safeParse(payload);
    if (!validation.success) {
      socket.emit(GameEvents.ERROR, validation.error.issues[0]?.message || 'Invalid payload');
      return;
    }
    const { useMultiplier, multiplierValue } = validation.data;

    try {
      await RoomService.updateRoom(roomId, {
        useMultiplier,
        multiplierValue,
      });
    } catch (e) {
      logger.error('Error updating multiplier:', e);
    }
  });

  onMemberEvent(socket, SocketEvents.UPDATE_THEME, async (payload: unknown) => {
    const auth = await getAuthorizedData(
      socket,
      UPDATE_THEME_COOLDOWN_MS,
      SocketEvents.UPDATE_THEME,
    );
    if (!auth) return;
    const { roomId } = auth;

    const validation = UpdateThemeSchema.safeParse(payload);
    if (!validation.success) {
      socket.emit(GameEvents.ERROR, validation.error.issues[0]?.message || 'Invalid payload');
      return;
    }
    if (!isThemeAllowed(validation.data.theme, getSiteConfig().content)) {
      socket.emit(GameEvents.ERROR, 'That theme is not available on this site');
      return;
    }

    try {
      const sanitizedTheme = sanitize(validation.data.theme, 20);
      await RoomService.updateRoom(roomId, { theme: sanitizedTheme });
      logger.log(`Room ${roomId} theme updated to: ${sanitizedTheme}`);
    } catch (e) {
      logger.error('Error updating room theme:', e);
    }
  });
  onMemberEvent(socket, SocketEvents.TOGGLE_ISSUES, async (payload: unknown) => {
    const auth = await getAuthorizedData(
      socket,
      TOGGLE_ISSUES_COOLDOWN_MS,
      SocketEvents.TOGGLE_ISSUES,
    );
    if (!auth) return;
    const validation = ToggleIssuesSchema.safeParse(payload);
    if (!validation.success) {
      socket.emit(GameEvents.ERROR, 'Invalid issues setting');
      return;
    }
    if (!getSiteConfig().features.issues) {
      socket.emit(GameEvents.ERROR, 'Issues are turned off on this site.');
      return;
    }
    try {
      await RoomService.updateRoom(auth.roomId, {
        issuesEnabled: validation.data.issuesEnabled,
      });
    } catch (error) {
      logger.error('Error toggling issues:', error);
      socket.emit(GameEvents.ERROR, 'Unable to update issues setting');
    }
  });
}
