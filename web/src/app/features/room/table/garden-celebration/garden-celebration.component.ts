import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  inject,
  viewChild,
} from '@angular/core';

interface Point {
  x: number;
  y: number;
}
interface Mote {
  x: number;
  y: number;
  phase: number;
  size: number;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

@Component({
  selector: 'app-garden-celebration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<canvas #canvas aria-hidden="true"></canvas><span class="announcement" role="status">Perfect match · In harmony</span>',
  styleUrl: './garden-celebration.component.css',
})
export class GardenCelebrationComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');
  private frame = 0;
  private observer?: ResizeObserver;
  private started = 0;
  private width = 0;
  private height = 0;
  private anchors: Point[] = [];
  private readonly motes: Mote[] = Array.from({ length: 64 }, () => ({
    x: Math.random(),
    y: Math.random(),
    phase: Math.random() * Math.PI * 2,
    size: 0.7 + Math.random() * 1.8,
  }));

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.motion.addEventListener('change', this.stop);
      document.addEventListener('visibilitychange', this.onVisibility);
      if (this.motion.matches) return;
      const canvas = this.canvas().nativeElement;
      const context = canvas.getContext('2d');
      if (!context) return;
      this.observer = new ResizeObserver(() => this.measure());
      this.observer.observe(this.host.nativeElement);
      this.measure();
      this.started = performance.now();
      const draw = (now: number) => {
        const seconds = (now - this.started) / 1000;
        context.clearRect(0, 0, this.width, this.height);
        if (seconds >= 4.6) {
          this.stop();
          return;
        }
        this.draw(context, seconds);
        this.frame = requestAnimationFrame(draw);
      };
      this.frame = requestAnimationFrame(draw);
    });
  }

  private measure(): void {
    const bounds = this.host.nativeElement.getBoundingClientRect();
    this.width = bounds.width;
    this.height = bounds.height;
    const canvas = this.canvas().nativeElement;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(this.width * ratio);
    canvas.height = Math.round(this.height * ratio);
    canvas.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0);
    const cards =
      this.host.nativeElement.parentElement?.querySelectorAll<HTMLElement>('.card-display');
    this.anchors = Array.from(cards ?? []).map((card) => {
      const rect = card.getBoundingClientRect();
      return { x: rect.left + rect.width / 2 - bounds.left, y: rect.bottom - bounds.top + 7 };
    });
  }

  private draw(ctx: CanvasRenderingContext2D, t: number): void {
    const fade = 1 - ease((t - 3.1) / 1.5);
    const gathering = ease((t - 0.3) / 1.1);
    const release = ease((t - 1.65) / 1.9);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const connection = ease((t - 0.85) / 0.7) * (1 - ease((t - 2) / 0.7));
    this.anchors.forEach((anchor, index) => {
      const next = this.anchors[index + 1];
      if (next) {
        ctx.strokeStyle = `rgba(255,218,133,${connection * 0.65})`;
        ctx.lineWidth = 1.2;
        ctx.shadowColor = '#ffcf70';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(anchor.x, anchor.y);
        ctx.quadraticCurveTo(
          (anchor.x + next.x) / 2,
          Math.max(anchor.y, next.y) + 32,
          next.x,
          next.y,
        );
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      this.light(ctx, anchor.x, anchor.y, 24, connection * 0.65);
    });
    const count = this.width < 600 ? 34 : this.motes.length;
    this.motes.slice(0, count).forEach((mote, index) => {
      const anchor = this.anchors[index % this.anchors.length];
      if (!anchor) return;
      const startX = mote.x * this.width;
      const startY = mote.y * this.height;
      const angle = mote.phase + t * 2;
      const orbitX = anchor.x + Math.cos(angle) * 16;
      const orbitY = anchor.y + Math.sin(angle) * 9;
      const x = startX + (orbitX - startX) * gathering + Math.cos(mote.phase) * release * 150;
      const y = startY + (orbitY - startY) * gathering - release * (75 + mote.y * 150);
      const alpha = ease(t / 0.4) * fade * (0.65 + 0.35 * Math.sin(t * 5 + mote.phase));
      this.light(ctx, x, y, mote.size * 6, alpha);
      ctx.fillStyle = `rgba(255,244,185,${alpha})`;
      ctx.beginPath();
      ctx.ellipse(x, y, mote.size, mote.size * 0.7, angle, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    this.blooms(ctx, t, fade);
    this.petals(ctx, t, fade);
  }

  private light(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    alpha: number,
  ): void {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, size);
    glow.addColorStop(0, `rgba(255,220,136,${alpha})`);
    glow.addColorStop(0.25, `rgba(240,185,77,${alpha * 0.35})`);
    glow.addColorStop(1, 'rgba(240,185,77,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - size, y - size, size * 2, size * 2);
  }

  private blooms(ctx: CanvasRenderingContext2D, t: number, fade: number): void {
    const compact = this.width < 600;
    for (let i = 0; i < 10; i++) {
      const growth = ease((t - 1.25 - (i % 5) * 0.07) / 0.75);
      if (!growth) continue;
      const angle = (i / 10) * Math.PI * 2;
      const x = compact
        ? i % 2
          ? this.width - 15
          : 15
        : this.width / 2 + Math.cos(angle) * (this.width / 2 - 22);
      const y = compact
        ? this.height * (0.16 + Math.floor(i / 2) * 0.15)
        : this.height / 2 + Math.sin(angle) * (this.height / 2 - 32);
      const scale = growth * (compact ? 0.55 : 1);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.globalAlpha = fade * 0.9;
      ctx.rotate(angle + t * 0.025);
      ctx.shadowColor = '#f4b27f';
      ctx.shadowBlur = 14;
      for (let petal = 0; petal < 7; petal++) {
        ctx.rotate((Math.PI * 2) / 7);
        const color = ctx.createLinearGradient(0, 0, 0, -22);
        color.addColorStop(0, '#b96554');
        color.addColorStop(0.65, '#efb18a');
        color.addColorStop(1, '#ffe2b1');
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(0, -11, 5.5, 13, 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffe7a0';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private petals(ctx: CanvasRenderingContext2D, t: number, fade: number): void {
    const count = this.width < 600 ? 18 : 32;
    this.motes.slice(0, count).forEach((mote) => {
      const age = t - 1.6 - mote.y * 0.45;
      if (age <= 0) return;
      const x = mote.x * this.width + Math.sin(age * 1.7 + mote.phase) * 38;
      const y = this.height * (0.12 + mote.y * 0.42) + age * 38 + age * age * 12;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(mote.phase + age * 1.5);
      ctx.scale(0.35 + Math.abs(Math.cos(age * 2 + mote.phase)) * 0.65, 1);
      ctx.globalAlpha = ease(age / 0.25) * fade * 0.8;
      ctx.shadowColor = '#0006';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 5;
      const color = ctx.createLinearGradient(-8, -5, 8, 5);
      color.addColorStop(0, '#ffe1b6');
      color.addColorStop(1, '#cd806e');
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.bezierCurveTo(-3, -11, 10, -7, 8, 0);
      ctx.bezierCurveTo(5, 8, -5, 5, -8, 0);
      ctx.fill();
      ctx.restore();
    });
  }

  private readonly onVisibility = () => {
    if (document.hidden) this.stop();
  };
  private readonly stop = () => {
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.canvas().nativeElement.getContext('2d')?.clearRect(0, 0, this.width, this.height);
  };

  ngOnDestroy(): void {
    this.stop();
    this.motion.removeEventListener('change', this.stop);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
