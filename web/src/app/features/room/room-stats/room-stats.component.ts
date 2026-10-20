import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RoomStatsSchema, type RoomStats, type RoomStatsMetric } from '@poker/shared';
import { resolveApiUrl } from '@core/api/api-url';
import { SocketService } from '@core/socket/socket.service';
import { SiteConfigService } from '@core/config/site-config.service';
import { PokerStore } from '../state/poker.store';

type StatsReloadTrigger = 'refresh' | 'previous' | 'next' | RoomStatsMetric;

const METRICS: readonly { key: RoomStatsMetric; label: string; icon: string }[] = [
  { key: 'votesCast', label: 'Votes cast', icon: '🗳️' },
  { key: 'throwsSent', label: 'Throws sent', icon: '🚀' },
  { key: 'throwsReceived', label: 'Throws received', icon: '🎯' },
  { key: 'barragesSent', label: 'Barrages sent', icon: '🎉' },
  { key: 'bestVoteStreak', label: 'Vote streak', icon: '🔥' },
  { key: 'characterVariety', label: 'Character variety', icon: '🪁' },
];
const THROW_METRICS: ReadonlySet<RoomStatsMetric> = new Set<RoomStatsMetric>([
  'throwsSent',
  'throwsReceived',
  'barragesSent',
  'characterVariety',
]);

@Component({
  selector: 'app-room-stats',
  imports: [RouterLink, DatePipe, DecimalPipe],
  templateUrl: './room-stats.component.html',
  styleUrl: './room-stats.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomStatsComponent {
  private readonly store = inject(PokerStore);
  private readonly socket = inject(SocketService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly siteConfig = inject(SiteConfigService);
  /** Throw metrics and awards only make sense while the site allows throwing. */
  readonly throwingEnabled = computed(() => this.siteConfig.config().content.throwables);
  readonly siteName = this.siteConfig.siteName;
  private request: AbortController | undefined;
  readonly roomId = signal('');
  readonly stats = signal<RoomStats | null>(null);
  readonly loading = signal(true);
  readonly reloadTrigger = signal<StatsReloadTrigger | null>(null);
  readonly error = signal('');
  readonly sort = signal<RoomStatsMetric>('votesCast');
  readonly loadedSort = signal<RoomStatsMetric>('votesCast');
  readonly page = signal(1);
  readonly metrics = computed(() =>
    this.throwingEnabled() ? METRICS : METRICS.filter((metric) => !THROW_METRICS.has(metric.key)),
  );
  readonly roomMetrics = computed(() =>
    this.metrics().filter(
      (metric): metric is (typeof METRICS)[number] & { key: keyof RoomStats['totals'] } =>
        metric.key !== 'bestVoteStreak' && metric.key !== 'characterVariety',
    ),
  );
  readonly selectedMetric = computed(
    () => this.metrics().find((metric) => metric.key === this.loadedSort()) ?? this.metrics()[0],
  );
  readonly atTable = computed(
    () =>
      this.store.isConnected() &&
      this.store.currentRoom()?.id === this.roomId() &&
      this.socket.isInRoom(this.roomId()),
  );
  readonly issueStats = computed(() => {
    const room = this.store.currentRoom();
    if (this.atTable() && room?.id === this.roomId() && !room.issuesEnabled) return null;
    return this.stats()?.issueStats ?? null;
  });
  readonly playerAwards = computed(() =>
    this.allAwards().filter((award) => this.throwingEnabled() || !THROW_METRICS.has(award.metric)),
  );
  private readonly allAwards = computed(() => [
    {
      title: 'On a Roll',
      icon: '🔥',
      unit: 'rounds',
      description: 'Best voting streak',
      score: this.stats()?.awards.onARoll ?? null,
      metric: 'bestVoteStreak' as const,
    },
    {
      title: 'Variety Show',
      icon: '🪁',
      unit: 'characters',
      description: 'Different throwables used',
      score: this.stats()?.awards.varietyShow ?? null,
      metric: 'characterVariety' as const,
    },
  ]);
  readonly pages = computed(() => {
    const stats = this.stats();
    return stats ? Math.max(1, Math.ceil(stats.participants / stats.pageSize)) : 1;
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.request?.abort());
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.roomId.set((params.get('id') ?? '').toLowerCase());
      this.page.set(1);
      this.stats.set(null);
      void this.load();
    });
  }

  chooseMetric(metric: RoomStatsMetric) {
    if (this.loading()) return;
    this.sort.set(metric);
    this.page.set(1);
    void this.load(metric);
  }

  changePage(delta: number) {
    this.page.update((page) => Math.max(1, Math.min(this.pages(), page + delta)));
    void this.load(delta < 0 ? 'previous' : 'next');
  }

  async load(trigger: StatsReloadTrigger | null = null) {
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    this.loading.set(true);
    this.reloadTrigger.set(trigger);
    this.error.set('');
    const requestedSort = this.sort();
    try {
      const response = await fetch(
        `${resolveApiUrl()}/api/rooms/${encodeURIComponent(this.roomId())}/stats?page=${this.page()}&sort=${requestedSort}`,
        {
          credentials: 'include',
          cache: 'no-store',
          signal: request.signal,
        },
      );
      if (!response.ok)
        throw new Error(
          response.status === 401 || response.status === 403
            ? 'Join this room and get approved to see its stats.'
            : response.status === 429
              ? 'Lots of stats requests! Please try again in a minute.'
              : 'Could not load room stats. Please try again.',
        );
      const payload: unknown = await response.json();
      const stats = RoomStatsSchema.parse(payload);
      if (!request.signal.aborted) {
        this.stats.set(stats);
        this.loadedSort.set(requestedSort);
      }
    } catch (error) {
      if (!request.signal.aborted)
        this.error.set(
          error instanceof Error && !(error.name === 'ZodError')
            ? error.message
            : 'Could not load room stats. Please try again.',
        );
    } finally {
      if (!request.signal.aborted) {
        this.loading.set(false);
        this.reloadTrigger.set(null);
      }
    }
  }
}
