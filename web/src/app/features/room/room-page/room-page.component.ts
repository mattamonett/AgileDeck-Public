import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  THEMES,
  UpdateRoomNameSchema,
  UpdateUserSchema,
  VALID_VOTES,
  isThrowablePermitted,
} from '@poker/shared';
import { SiteConfigService } from '@core/config/site-config.service';
import { SocketService } from '@core/socket/socket.service';
import { clearLegacyClientIdentity, USER_NAME_STORAGE_KEY } from '@core/storage/storage-keys';
import { UpdateBannerComponent } from '@core/update/update-banner.component';
import { VersionCheckService } from '@core/update/version-check.service';
import { FeedbackUpdatesService } from '@shared/feedback/feedback-updates.service';
import { copyText } from '@shared/utils/clipboard';
import { EmojiPickerComponent } from '../effects/emoji-picker/emoji-picker.component';
import { GardenAtmosphereComponent } from '../effects/garden-atmosphere/garden-atmosphere.component';
import { NudgeAlertComponent } from '../effects/nudge-alert/nudge-alert.component';
import { PokerHandComponent } from '../hand/poker-hand.component';
import { RoomHeaderComponent } from '../header/room-header.component';
import { IssuesPanelComponent } from '../issues/issues-panel.component';
import { RoomLobbyComponent } from '../room-lobby/room-lobby.component';
import { RoomQrOverlayComponent } from '../room-qr-overlay/room-qr-overlay.component';
import { isGardenTheme } from '../room-theme';
import { ALL_EMOJIS_WITH_TAGS, TOP_PROJECTILES } from '../room.constants';
import { InteractionService } from '../services/interaction.service';
import { NudgeSoundService } from '../services/nudge-sound.service';
import {
  DEFAULT_PROJECTILE,
  loadProjectilePreference,
  saveProjectilePreference,
} from '../services/projectile-preference';
import { SeasonalThrowablesService } from '../services/seasonal-throwables.service';
import { PlayerSettingsComponent } from '../settings/player-settings/player-settings.component';
import { RoomSettingsPanelComponent } from '../settings/room-settings-panel/room-settings-panel.component';
import { SidePanelComponent } from '../settings/side-panel/side-panel.component';
import { PokerStore } from '../state/poker.store';
import { PokerTableComponent } from '../table/poker-table/poker-table.component';

/** The room route: joins the room and orchestrates the table, hand, issues and side panels. */
@Component({
  selector: 'app-room-page',
  imports: [
    GardenAtmosphereComponent,
    UpdateBannerComponent,
    EmojiPickerComponent,
    SidePanelComponent,
    RoomHeaderComponent,
    RoomLobbyComponent,
    RoomQrOverlayComponent,
    PokerTableComponent,
    PokerHandComponent,
    NudgeAlertComponent,
    PlayerSettingsComponent,
    RoomSettingsPanelComponent,
    IssuesPanelComponent,
  ],
  templateUrl: './room-page.component.html',
  styleUrls: [
    './room-page.component.css',
    './space-room.css',
    './retro-room.css',
    './vegas-room.css',
    './garden-room.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly siteConfig = inject(SiteConfigService);
  private readonly versionCheck = inject(VersionCheckService);
  private readonly seasonal = inject(SeasonalThrowablesService);
  protected readonly socket = inject(SocketService);
  protected readonly store = inject(PokerStore);
  protected readonly interaction = inject(InteractionService);
  protected readonly feedbackUpdates = inject(FeedbackUpdatesService);
  protected readonly nudgeSound = inject(NudgeSoundService);

  readonly roomId = signal('');
  protected readonly cards = VALID_VOTES;
  protected readonly siteName = this.siteConfig.siteName;
  protected readonly content = computed(() => this.siteConfig.config().content);
  protected readonly feedbackEnabled = computed(() => this.siteConfig.config().features.feedback);
  protected readonly issuesAvailable = computed(() => this.siteConfig.config().features.issues);
  /** The room's issue panels show only when the site offers issues and the room has them on. */
  protected readonly issuesShown = computed(
    () => this.issuesAvailable() && this.currentRoom()?.issuesEnabled !== false,
  );

  protected readonly currentUser = this.store.currentUser;
  protected readonly currentRoom = this.store.currentRoom;
  protected readonly revealState = this.store.revealState;
  protected readonly isObserver = this.store.isObserver;
  protected readonly isCountdown = this.store.isCountdown;
  protected readonly healthStatus = this.store.healthStatus;
  protected readonly isGardenTheme = computed(() => isGardenTheme(this.currentRoom()?.theme));
  protected readonly throwBlockedUntil = computed(() => {
    const id = this.currentUser()?.id;
    return this.store.users().find((user) => user.id === id)?.throwOverheat?.until ?? 0;
  });

  protected readonly showSettings = signal(false);
  protected readonly showRoomSettings = signal(false);
  protected readonly showQrCode = signal(false);
  readonly showEmojiPicker = signal(false);
  protected readonly editUserName = signal('');
  protected readonly editRoomName = signal('');
  protected readonly editMultiplier = signal(1.0);

  readonly roomMood = computed(() => this.currentRoom()?.mood ?? this.content().defaultMood);
  protected readonly waitingOnMe = computed(() => {
    const me = this.currentUser();
    if (!me || this.store.revealState()) return false;
    return this.store.players().some((user) => user.id === me.id && !user.hasVoted);
  });
  readonly topProjectiles = computed(() =>
    TOP_PROJECTILES.filter((char) => this.isThrowableHere(char)),
  );
  readonly allEmojisWithTags = computed(() =>
    ALL_EMOJIS_WITH_TAGS.filter(({ char }) => this.isThrowableHere(char)),
  );
  readonly themes = computed(() => {
    const allowed = this.content().themes;
    return THEMES.filter((theme) => allowed.includes(theme.id));
  });

  private readonly projectilePreference = signal(loadProjectilePreference());
  /**
   * The saved throwable while this room allows it, otherwise the first one it
   * does; null when the site turned throwing off or allows nothing here.
   */
  readonly selectedProjectile = computed(() => {
    const preferred = this.projectilePreference();
    if (this.isThrowableHere(preferred)) return preferred;
    if (this.isThrowableHere(DEFAULT_PROJECTILE)) return DEFAULT_PROJECTILE;
    return this.topProjectiles()[0] ?? this.allEmojisWithTags()[0]?.char ?? null;
  });
  readonly throwingEnabled = computed(() => this.selectedProjectile() !== null);

  constructor() {
    // Feedback access starts with room approval, so check for news once approved.
    this.feedbackUpdates.watch(
      () => this.feedbackEnabled() && this.currentUser()?.isApproved === true,
    );
  }

  async ngOnInit(): Promise<void> {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('id')?.toLowerCase();
      if (id) this.enterRoom(id);
    });

    this.editUserName.set(this.currentUser()?.name ?? '');

    const [webVersion, apiVersion] = await Promise.all([
      this.versionCheck.getWebVersion(),
      this.versionCheck.getApiVersion(),
    ]);
    this.store.setVersions(webVersion, apiVersion);
  }

  private enterRoom(id: string): void {
    this.roomId.set(id);
    clearLegacyClientIdentity(id);
    const name = localStorage.getItem(USER_NAME_STORAGE_KEY);
    const createRoomIntent = history.state.create === true;

    if (!name || !this.siteConfig.hasAcceptedAgreement()) {
      void this.router.navigate(['/'], { queryParams: { join: id } });
      return;
    }
    if (!this.socket.isInRoom(id)) {
      this.socket.joinRoom(id, name, createRoomIntent);
    }
  }

  private isThrowableHere(char: string): boolean {
    return (
      isThrowablePermitted(char, this.roomMood(), this.content()) && this.seasonal.isAvailable(char)
    );
  }

  protected openFeedback(): void {
    const queryParams: Record<string, string> = { from: this.roomId() };
    if (this.feedbackUpdates.hasUpdates()) queryParams['tab'] = 'mine';
    void this.router.navigate(['/feedback'], { queryParams });
  }

  protected toggleQrCode(): void {
    this.showQrCode.update((shown) => !shown);
  }

  protected copyLink(): void {
    copyText(window.location.href);
  }

  protected toggleSettings(): void {
    this.showSettings.update((shown) => !shown);
    if (this.showSettings()) {
      this.showRoomSettings.set(false);
      this.editUserName.set(this.currentUser()?.name ?? '');
    }
  }

  protected toggleRoomSettings(): void {
    this.showRoomSettings.update((shown) => !shown);
    if (this.showRoomSettings()) {
      this.showSettings.set(false);
      this.editRoomName.set(this.currentRoom()?.name ?? '');
      // A multiplier of 0 is not a usable value, so it falls back to 1 like a missing one.
      this.editMultiplier.set(this.currentRoom()?.multiplierValue || 1.0);
      this.checkHealth();
    }
  }

  protected checkHealth(): void {
    this.store.clearHealthStatus();
    this.socket.checkHealth();
  }

  protected updateUserName(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;

    const parsed = UpdateUserSchema.safeParse({ name: trimmed });
    if (!parsed.success) {
      alert(parsed.error.issues[0]?.message ?? 'Invalid player name.');
      return;
    }

    this.socket.updateUser(trimmed);
  }

  protected testNudgeSound(): void {
    this.nudgeSound.test(this.roomMood());
  }

  protected toggleObserver(): void {
    this.socket.toggleObserver(!this.isObserver());
  }

  protected vote(card: string): void {
    if (this.revealState() || this.isObserver()) return;

    // Clicking the selected card again withdraws the vote, except during the countdown.
    if (this.currentUser()?.vote === card) {
      if (this.isCountdown()) return;
      this.socket.vote(null);
    } else {
      this.socket.vote(card);
    }
  }

  protected reveal(): void {
    this.socket.reveal();
  }

  protected reset(): void {
    this.socket.reset();
  }

  protected saveRoomName(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;

    const parsed = UpdateRoomNameSchema.safeParse({ name: trimmed });
    if (!parsed.success) {
      alert(parsed.error.issues[0]?.message ?? 'Invalid room name.');
      return;
    }

    this.socket.updateRoomName(trimmed);
    this.showRoomSettings.set(false);
  }

  protected toggleAutoReveal(mode: 'manual' | 'auto'): void {
    this.socket.toggleAutoReveal(mode === 'auto');
  }

  protected toggleMultiplier(): void {
    const room = this.currentRoom();
    if (!room) return;
    this.socket.updateMultiplier(!room.useMultiplier, room.multiplierValue);
  }

  protected saveMultiplier(multiplier: number): void {
    const room = this.currentRoom();
    if (!room) return;
    this.socket.updateMultiplier(room.useMultiplier, multiplier);
  }

  openEmojiPicker(): void {
    if (!this.throwingEnabled()) return;
    void this.seasonal.refresh();
    this.showEmojiPicker.set(true);
  }

  selectProjectile(emoji: string): void {
    if (!this.isThrowableHere(emoji)) return;
    this.projectilePreference.set(emoji);
    saveProjectilePreference(emoji);
    this.showEmojiPicker.set(false);
  }

  throwEquipped(targetUserId: string): void {
    const projectile = this.selectedProjectile();
    if (!projectile || this.currentUser()?.id === targetUserId) return;
    this.interaction.throwProjectile(targetUserId, projectile);
  }

  protected barrageEquipped(targetUserId: string): void {
    const projectile = this.selectedProjectile();
    if (!projectile || this.currentUser()?.id === targetUserId) return;
    this.socket.barrageProjectile(targetUserId, projectile);
  }

  protected setTheme(theme: string): void {
    const current = this.currentRoom();
    if (current) {
      this.store.setCurrentRoom({ ...current, theme });
    }
    this.socket.updateTheme(theme);
  }
}
