import * as THREE from 'three';
import { impactKind, seededRandom, type Point } from '../flight/flight-math';
import { disposeObject, IMPACT_COLORS } from '../engine/throw-models';

interface Fragment {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  origin: Point;
  vx: number;
  vy: number;
  spin: number;
  born: number;
  life: number;
  stain: boolean;
  anchor: HTMLElement;
  offset: Point;
}

interface Impact {
  emoji: string;
  id: string;
  end: Point;
  direction: number;
  target: HTMLElement;
}

/** Owns bounded impact debris, physics, and GPU resource disposal. */
export class ImpactFragments {
  private readonly fragments: Fragment[] = [];
  constructor(private readonly scene: THREE.Scene) {}
  get active(): boolean {
    return this.fragments.length > 0;
  }

  update(now: number, rect: (element: HTMLElement) => DOMRect): void {
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const fragment = this.fragments[i];
      if (!fragment) continue;
      const age = (now - fragment.born) / 1000;
      const progress = age / fragment.life;
      if (progress >= 1) {
        disposeObject(fragment.mesh);
        this.fragments.splice(i, 1);
        continue;
      }
      fragment.mesh.material.opacity =
        Math.min(1, (1 - progress) * 2.5) * (fragment.stain ? 0.8 : 1);
      if (fragment.stain) {
        const anchor = rect(fragment.anchor);
        fragment.mesh.position.set(
          anchor.left + fragment.offset.x,
          -(anchor.top + fragment.offset.y),
          40,
        );
        const scale = Math.min(1, age * 12);
        fragment.mesh.scale.set(scale * 1.4, scale, 0.12);
      } else {
        fragment.mesh.position.set(
          fragment.origin.x + fragment.vx * age,
          -(fragment.origin.y + fragment.vy * age + 230 * age * age),
          45,
        );
        fragment.mesh.rotation.x = age * fragment.spin;
        fragment.mesh.rotation.z = age * fragment.spin * 0.7;
      }
    }
  }

  emit(impact: Impact, now: number): void {
    const kind = impactKind(impact.emoji);
    const colors = IMPACT_COLORS[kind];
    const random = seededRandom(impact.id + ':impact');
    const wet = ['tomato', 'cream', 'liquid', 'dust'].includes(kind);
    const count = window.innerWidth < 600 ? 12 : 20;
    const targetBounds = impact.target.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      const stain = wet && i < 6;
      const size = stain ? 4 + random() * 9 : 1.5 + random() * 3;
      const geometry = stain
        ? this.splatter(size, random)
        : kind === 'paper' || kind === 'petals'
          ? new THREE.PlaneGeometry(size * 2, size * (kind === 'petals' ? 3 : 1.5))
          : new THREE.SphereGeometry(size, 7, 5);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: colors[i % colors.length] ?? 0xffd988,
          roughness: wet ? 0.24 : 0.85,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      const angle = random() * Math.PI * 2;
      const speed = 40 + random() * 130;
      const origin = {
        x: impact.end.x + (stain ? Math.cos(angle) * 16 : 0),
        y: impact.end.y + (stain ? Math.sin(angle) * 18 : 0),
      };
      mesh.position.set(origin.x, -origin.y, 40);
      this.scene.add(mesh);
      this.fragments.push({
        mesh,
        origin,
        vx: Math.cos(angle) * speed + impact.direction * 25,
        vy: Math.sin(angle) * speed - 65,
        spin: (random() - 0.5) * 12,
        born: now,
        life: stain ? 1.4 + random() * 0.6 : 0.55 + random() * 0.5,
        stain,
        anchor: impact.target,
        offset: { x: origin.x - targetBounds.left, y: origin.y - targetBounds.top },
      });
    }
    while (this.fragments.length > 450) {
      const old = this.fragments.shift();
      if (old) disposeObject(old.mesh);
    }
  }

  private splatter(radius: number, random: () => number): THREE.ShapeGeometry {
    const points = Array.from({ length: 10 }, (_, index) => {
      const angle = (index / 10) * Math.PI * 2;
      const reach = radius * (0.55 + random() * 1.2);
      return new THREE.Vector2(Math.cos(angle) * reach, Math.sin(angle) * reach);
    });
    const shape = new THREE.Shape();
    const first = points[0];
    const last = points[points.length - 1];
    if (first && last) shape.moveTo((first.x + last.x) / 2, (first.y + last.y) / 2);
    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      const next = points[(index + 1) % points.length];
      if (point && next)
        shape.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    }
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }

  clear(): void {
    for (const fragment of this.fragments) disposeObject(fragment.mesh);
    this.fragments.length = 0;
  }
}
