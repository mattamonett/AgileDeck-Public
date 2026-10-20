import { ChangeDetectionStrategy, Component, inject, computed, signal } from '@angular/core';
import {
  AdminUsageResponseSchema,
  THEMES,
  type AdminRoomSetting,
  type AdminUsageSummary,
  type UsageMetric,
} from '@poker/shared';
import { AdminSessionService } from './admin-session.service';

const SETTING_LABELS: Record<AdminRoomSetting, string> = {
  autoReveal: 'Auto reveal',
  multiplier: 'Multiplier',
  lobby: 'Lobby approval',
  issues: 'Issues panel',
};

const METRIC_LABELS: Record<UsageMetric, string> = {
  'room.created': 'Rooms created',
  'round.revealed.manual': 'Rounds revealed by hand',
  'round.revealed.auto': 'Rounds revealed automatically',
  'round.reset': 'Rounds reset',
  'setting.autoReveal.on': 'Auto reveal turned on',
  'setting.autoReveal.off': 'Auto reveal turned off',
  'setting.multiplier.on': 'Multiplier turned on',
  'setting.multiplier.off': 'Multiplier turned off',
  'setting.issues.on': 'Issues panel turned on',
  'setting.issues.off': 'Issues panel turned off',
  'setting.theme.default': 'Theme changed to Moonlit Garden',
  'setting.theme.space': 'Theme changed to Deep Space',
  'setting.theme.retro': 'Theme changed to Retro CRT',
  'setting.theme.vegas': 'Theme changed to Las Vegas',
  'setting.theme.graveyard': 'Theme changed to Graveyard Shift',
  'setting.theme.harvest': 'Theme changed to Harvest Table',
  'setting.theme.cabin': 'Theme changed to Fireside Cabin',
  'setting.mood.friendly': 'Mood changed to Friendly',
  'setting.mood.playful': 'Mood changed to Playful',
  'setting.mood.spicy': 'Mood changed to Spicy',
  'setting.roomName': 'Room renamed',
  'observer.on': 'Switched to observer',
  'observer.off': 'Switched to player',
  'nudge.single': 'Nudges sent',
  'nudge.stragglers': 'Nudge everyone left',
  'throw.single': 'Throws',
  'throw.barrage': 'Barrages',
  'issue.created': 'Issues created',
  'issue.updated': 'Issues edited',
  'issue.deleted': 'Issues deleted',
  'issue.imported': 'Issue imports',
  'issue.nextStarted': 'Next issue started',
  'issue.closedCleared': 'Closed issues cleared',
};

@Component({
  selector: 'app-usage-admin',
  templateUrl: './usage-admin.component.html',
  styleUrls: ['./admin-shared.css', './usage-admin.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageAdminComponent {
  private readonly session = inject(AdminSessionService);
  readonly summary = signal<AdminUsageSummary | null>(null);
  /** True when the site operator turned usage stats off in config/site.json. */
  readonly turnedOff = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly settingLabels = SETTING_LABELS;
  readonly metricLabels = METRIC_LABELS;
  /** Most used features first, so the busiest ones lead the table. */
  readonly events = computed(() =>
    [...(this.summary()?.events ?? [])].sort(
      (a, b) => b.last30Days - a.last30Days || b.last7Days - a.last7Days,
    ),
  );
  private generation = 0;

  constructor() {
    void this.load();
  }

  themeName(theme: string): string {
    return THEMES.find((entry) => entry.id === theme)?.name ?? theme;
  }

  percent(part: number, whole: number): string {
    return whole ? Math.round((part / whole) * 100) + '%' : '–';
  }

  async load(): Promise<void> {
    if (this.loading()) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await this.session.request('/usage', 'Could not load usage.');
      const parsed = AdminUsageResponseSchema.safeParse(data);
      if (!parsed.success) throw new Error('Could not load usage. Refresh the page and try again.');
      if (generation !== this.generation) return;
      const usage = parsed.data;
      this.turnedOff.set('usageStats' in usage);
      this.summary.set('usageStats' in usage ? null : usage);
    } catch (error) {
      if (generation === this.generation)
        this.error.set(error instanceof Error ? error.message : 'Could not load usage.');
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
}
