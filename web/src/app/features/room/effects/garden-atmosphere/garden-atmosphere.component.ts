import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-garden-atmosphere',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="moon-halo"></div>
    <div class="lantern-glow left"></div>
    <div class="lantern-glow right"></div>
    <div class="mist"></div>
    @for (mote of motes; track mote.id) {
      <i
        [style.left.%]="mote.x"
        [style.top.%]="mote.y"
        [style.--delay]="mote.delay + 's'"
        [style.--duration]="mote.duration + 's'"
        [style.--drift]="mote.drift + 'px'"
      ></i>
    }
  `,
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      position: fixed;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
      z-index: 1;
    }
    i {
      position: absolute;
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: #fff4c6;
      box-shadow:
        0 0 5px 2px #ffd48788,
        0 0 18px 6px #f8c46922;
      animation: wander var(--duration) ease-in-out var(--delay) infinite alternate;
    }
    .moon-halo {
      position: absolute;
      left: 19%;
      top: 3%;
      width: 15vw;
      height: 15vw;
      border-radius: 50%;
      background: radial-gradient(circle, #9dd4e918, transparent 70%);
      animation: breathe 9s ease-in-out infinite alternate;
    }
    .lantern-glow {
      position: absolute;
      top: 28%;
      width: 12vw;
      height: 18vw;
      background: radial-gradient(ellipse, #ffb95f20, transparent 65%);
      animation: breathe 3.7s ease-in-out infinite alternate;
    }
    .left {
      left: 0;
    }
    .right {
      right: 0;
      animation-delay: -1.8s;
    }
    .mist {
      position: absolute;
      inset: 30% -20% -30%;
      background:
        radial-gradient(ellipse at 20% 65%, #83b6ae0b, transparent 40%),
        radial-gradient(ellipse at 70% 80%, #acccd30b, transparent 35%);
      animation: mist 26s ease-in-out infinite alternate;
    }
    @keyframes wander {
      0% {
        opacity: 0.12;
        transform: translate3d(0, 0, 0) scale(0.5);
      }
      45% {
        opacity: 0.9;
      }
      100% {
        opacity: 0.25;
        transform: translate3d(var(--drift), -65px, 0) scale(1.15);
      }
    }
    @keyframes breathe {
      from {
        opacity: 0.5;
        transform: scale(0.96);
      }
      to {
        opacity: 1;
        transform: scale(1.06);
      }
    }
    @keyframes mist {
      to {
        transform: translate3d(7%, -3%, 0);
      }
    }
    @media (max-width: 600px) {
      i:nth-of-type(n + 14) {
        display: none;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host {
        display: none;
      }
    }
  `,
})
export class GardenAtmosphereComponent {
  readonly motes = Array.from({ length: 30 }, (_, id) => ({
    id,
    x: (id * 37.3) % 100,
    y: (id * 23.7 + 10) % 100,
    delay: -id * 1.7,
    duration: 5 + (id % 7),
    drift: ((id * 19) % 90) - 45,
  }));
}
