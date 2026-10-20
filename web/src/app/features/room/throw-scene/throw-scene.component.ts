import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import type { Projectile } from './projectile';
import type { ThrowRenderer } from './engine/throw-renderer';

@Component({
  selector: 'app-throw-scene',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<canvas #canvas aria-hidden="true"></canvas>',
  styles:
    ':host { position: fixed; inset: 0; z-index: 150; pointer-events: none; } canvas { width: 100vw; height: 100vh; display: block; }',
})
export class ThrowSceneComponent implements AfterViewInit {
  projectiles = input<readonly Projectile[]>([]);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private renderer?: ThrowRenderer;
  private seen = new Set<string>();
  private readonly fallbackAnimations = new Set<Animation>();

  constructor() {
    effect(() => this.sync(this.projectiles()));
    this.destroyRef.onDestroy(() => {
      this.renderer?.dispose();
      for (const animation of this.fallbackAnimations) animation.cancel();
      this.fallbackAnimations.clear();
    });
  }

  async ngAfterViewInit() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.sync(this.projectiles());
      return;
    }
    // Lazy chunk keeps the 3D engine out of the app's initial load.
    try {
      const { ThrowRenderer } = await import('./engine/throw-renderer');
      if (this.destroyRef.destroyed) return;
      this.zone.runOutsideAngular(() => {
        const root = this.host.nativeElement.closest('app-poker-table');
        const canvas = this.canvas()?.nativeElement;
        if (root instanceof HTMLElement && canvas) this.renderer = new ThrowRenderer(canvas, root);
      });
    } catch {
      // WebGL is optional: voting and accessible hit feedback still work.
    }
    if (!this.destroyRef.destroyed) this.sync(this.projectiles());
  }

  private sync(projectiles: readonly Projectile[]) {
    if (!this.canvas()) return;
    this.zone.runOutsideAngular(() => {
      for (const projectile of projectiles) {
        if (this.seen.has(projectile.id)) continue;
        this.seen.add(projectile.id);
        if (!this.renderer?.add(projectile)) this.fallback(projectile);
      }
      this.seen = new Set(projectiles.map((projectile) => projectile.id));
    });
  }

  private fallback(projectile: Projectile) {
    const root = this.host.nativeElement.closest('app-poker-table');
    const target = Array.from(root?.querySelectorAll<HTMLElement>('[data-player-id]') ?? []).find(
      (element) => element.dataset['playerId'] === projectile.targetUserId,
    );
    if (!target) return;
    const animation = target.animate(
      [{ filter: 'brightness(1)' }, { filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }],
      { duration: 300 },
    );
    this.fallbackAnimations.add(animation);
    void animation.finished.then(
      () => this.fallbackAnimations.delete(animation),
      () => this.fallbackAnimations.delete(animation),
    );
  }
}
