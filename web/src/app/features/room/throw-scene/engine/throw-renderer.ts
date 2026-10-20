import * as THREE from 'three';
import { facingFrom } from '../character';
import { cardBounds, contactPoint, raceBounds, roomCards } from '../flight/flight-bounds';
import { impactKind } from '../flight/flight-math';
import { placeShadow } from '../flight/flight-shadow';
import { FlightTrails } from '../flight/flight-trails';
import { motionPoint, motionPose, projectileStyle } from '../flight/projectile-motion';
import { ImpactFragments } from '../landing/impact-fragments';
import type { TargetBounds } from '../landing/landing-effects';
import { LIGHTNING_CONTACT_MS } from '../landing/lightning-storm';
import { animateRainbowCard } from '../landing/rainbow-card';
import type { Projectile } from '../projectile';
import { createFlight, type Flight } from './flight-factory';
import { disposeObject } from './throw-models';

/** A demand-driven GPU layer. Room state stays entirely in Angular / Socket.IO. */
export class ThrowRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(0, 1, 0, -1, 0.1, 2000);
  private readonly flights: Flight[] = [];
  private readonly fragments = new ImpactFragments(this.scene);
  private readonly trails = new FlightTrails(this.scene);
  private readonly animations = new Set<Animation>();
  private frame = 0;
  private destroyed = false;
  private readonly motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    private canvas: HTMLCanvasElement,
    private root: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.localClippingEnabled = true;
    this.camera.position.z = 800;
    this.scene.add(new THREE.AmbientLight(0xffe6c5, 1.5));
    const key = new THREE.DirectionalLight(0xffedd6, 1.9);
    key.position.set(-200, 500, 600);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x89c9ce, 0.9);
    rim.position.set(500, -100, 200);
    this.scene.add(rim);
    this.resize();
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.visibility);
    canvas.addEventListener('webglcontextlost', this.contextLost);
  }

  private readonly contextLost = (event: Event) => {
    event.preventDefault();
    this.clear();
    this.destroyed = true;
  };

  private readonly visibility = () => {
    if (document.hidden) this.clear();
  };

  private readonly resize = () => {
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, window.innerWidth < 600 ? 1.25 : 1.75),
    );
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.right = window.innerWidth;
    this.camera.bottom = -window.innerHeight;
    this.camera.updateProjectionMatrix();
  };

  private anchor(userId: string): HTMLElement | undefined {
    const card = Array.from(this.root.querySelectorAll<HTMLElement>('[data-player-id]')).find(
      (item) => item.dataset['playerId'] === userId,
    );
    return (
      card?.querySelector<HTMLElement>('.card-display') ??
      Array.from(this.root.querySelectorAll<HTMLElement>('[data-observer-id]')).find(
        (item) => item.dataset['observerId'] === userId,
      )
    );
  }

  add(projectile: Projectile): boolean {
    if (this.destroyed) return false;
    if (document.hidden) return true;
    const source = this.anchor(projectile.sourceUserId);
    const target = this.anchor(projectile.targetUserId);
    if (!source || !target) return false;
    if (this.motion.matches) {
      const animation = target.animate([{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }], {
        duration: 180,
      });
      this.trackAnimation(animation);
      return true;
    }
    if (this.flights.length >= 36) {
      const oldest = this.flights.shift();
      if (oldest) this.removeFlight(oldest);
    }
    const flight = createFlight(projectile, source, target, () => raceBounds(this.root));
    if (flight.trick) this.scene.add(flight.trick.object);
    if (flight.landing) this.scene.add(flight.landing.object);
    this.scene.add(flight.shadow, flight.object);
    this.flights.push(flight);
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
    return true;
  }

  private readonly tick = (now: number) => {
    this.frame = 0;
    if (this.destroyed) return;
    // Read each player's location only once per frame, including while scrolling or reflowing.
    const bounds = new Map<HTMLElement, DOMRect>();
    const rect = (element: HTMLElement) => {
      const existing = bounds.get(element);
      if (existing) return existing;
      const value = element.getBoundingClientRect();
      bounds.set(element, value);
      return value;
    };
    for (const flight of this.flights) this.updateFlight(flight, now, rect);
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const flight = this.flights[i];
      if (
        flight &&
        flight.hitAt &&
        now - flight.hitAt > (flight.trick?.duration ?? flight.landing?.duration ?? 900)
      ) {
        this.removeFlight(flight);
        this.flights.splice(i, 1);
      }
    }
    this.fragments.update(now, rect);
    this.trails.update(now);
    this.renderer.render(this.scene, this.camera);
    if (this.flights.length || this.fragments.active || this.trails.active)
      this.frame = requestAnimationFrame(this.tick);
  };

  private updateFlight(flight: Flight, now: number, rect: (element: HTMLElement) => DOMRect): void {
    if (!flight.source.isConnected || !flight.target.isConnected) {
      flight.hitAt = now - (flight.trick?.duration ?? flight.landing?.duration ?? 900) - 1;
      flight.object.visible = flight.shadow.visible = false;
      return;
    }
    const a = rect(flight.source);
    const measured = rect(flight.target);
    const act = flight.landing?.act;
    const b = cardBounds(flight.target, measured, Boolean(act || flight.trick?.perform), rect);
    flight.start = { x: a.left + a.width / 2, y: a.top + a.height * 0.5 };
    const viewport = { x: window.innerWidth, y: window.innerHeight };
    flight.end = contactPoint(flight.landing, {
      b,
      view: viewport,
      start: flight.start,
      variation: flight.landingVariation,
      facing: flight.landingCard?.facing,
      landed: Boolean(flight.hitAt),
    });
    const trick = flight.trick;
    if (trick?.perform) {
      flight.shadow.visible = false;
      const facing = facingFrom(b, flight.start);
      if (!flight.hitAt) {
        flight.hitAt = flight.born;
        this.animateLanding(flight, b, now - flight.born);
      } else if (
        flight.landingCard &&
        (flight.landingCard.width !== b.width ||
          flight.landingCard.height !== b.height ||
          flight.landingCard.facing !== facing)
      ) {
        this.animateLanding(flight, b, now - flight.born);
      }
      trick.perform(now - flight.born, flight.object, a, b, viewport);
      return;
    }
    if (act?.perform) {
      const elapsed = now - flight.born;
      flight.shadow.visible = false;
      if (!flight.hitAt) {
        flight.hitAt = flight.born;
        this.animateLanding(flight, b, elapsed);
      } else if (
        flight.landingCard &&
        (flight.landingCard.width !== b.width || flight.landingCard.height !== b.height)
      ) {
        this.animateLanding(flight, b, elapsed);
      }
      flight.landing?.perform(elapsed, {
        start: flight.start,
        end: flight.end,
        b,
        view: viewport,
        target: flight.target,
      });
      return;
    }
    if (flight.storm) {
      const elapsed = now - flight.born;
      flight.shadow.visible = false;
      flight.storm.update(elapsed, flight.end, b.top);
      if (!flight.hitAt && elapsed >= LIGHTNING_CONTACT_MS) {
        flight.hitAt = now;
        this.impact(flight, now);
      }
      return;
    }
    if (flight.profile.race) flight.profile.race.bounds = raceBounds(this.root);
    if (flight.profile.swim) {
      flight.profile.swim.viewport = { x: window.innerWidth, y: window.innerHeight };
    }
    if (flight.profile.rocket) {
      flight.profile.rocket.viewport = { x: window.innerWidth, y: window.innerHeight };
    }
    const t = (now - flight.born) / flight.profile.duration;
    if (t < 1) {
      const approaching = act?.approach?.({
        t,
        elapsed: now - flight.born,
        start: flight.start,
        end: flight.end,
        b,
        view: viewport,
        profile: flight.profile,
      });
      if (approaching) {
        flight.shadow.visible = false;
        return;
      }
      const point = motionPoint(
        flight.start,
        flight.end,
        flight.profile,
        flight.projectile.emoji,
        t,
      );
      const pose = motionPose(flight.start, flight.end, flight.profile, flight.projectile.emoji, t);
      const lift = Math.sin(Math.PI * t);
      flight.object.position.set(point.x, -point.y, 30 + lift * 100);
      const faceFirst = flight.projectile.emoji === '🥧' ? Math.max(0, (t - 0.65) / 0.35) : 0;
      flight.object.rotation.set(pose.x + faceFirst * (Math.PI / 2 - pose.x), pose.y, pose.z);
      flight.object.scale.setScalar(pose.scale);
      flight.object.traverse((child) => {
        if (child instanceof THREE.Sprite) child.material.rotation = pose.z;
      });
      const trail = projectileStyle(flight.projectile.emoji)[3];
      this.trails.follow(trail, flight.object.position, pose.heading, now, flight);
      placeShadow(flight.shadow, point, flight.start, flight.end, t, lift);
    } else {
      if (!flight.hitAt) {
        flight.hitAt = now;
        if (flight.landing) {
          this.animateLanding(flight, b);
        } else {
          this.impact(flight, now);
        }
      }
      if (trick?.afterContact) {
        flight.object.visible = flight.shadow.visible = false;
        trick.afterContact(now - flight.hitAt, b, roomCards(this.root), rect);
        return;
      }
      if (flight.landing) {
        const facing = facingFrom(b, flight.end);
        if (
          act?.approach &&
          flight.landingCard &&
          (flight.landingCard.width !== b.width ||
            flight.landingCard.height !== b.height ||
            flight.landingCard.facing !== facing)
        ) {
          this.animateLanding(flight, b, now - flight.hitAt);
        }
        flight.shadow.visible = false;
        flight.landing.update(now - flight.hitAt, b, flight.end, viewport);
        return;
      }
      const elapsed = (now - flight.hitAt) / 1000;
      const soft = ['cream', 'tomato', 'liquid'].includes(impactKind(flight.projectile.emoji));
      flight.object.visible = !soft && elapsed < 0.7;
      const direction = Math.sign(flight.end.x - flight.start.x) || 1;
      const mode = projectileStyle(flight.projectile.emoji)[4];
      const gentle = ['float', 'flutter', 'hover', 'pulse'].includes(mode);
      const landingPose = motionPose(
        flight.start,
        flight.end,
        flight.profile,
        flight.projectile.emoji,
        1,
      );
      flight.object.position.set(
        flight.end.x + direction * elapsed * 34,
        -flight.end.y +
          (gentle
            ? elapsed * 45
            : Math.abs(Math.sin(elapsed * Math.PI * (flight.projectile.emoji === '⚽' ? 4 : 2))) *
                35 -
              elapsed * 70),
        20,
      );
      flight.object.rotation.z = gentle
        ? landingPose.z * Math.exp(-elapsed * 6)
        : landingPose.z + elapsed * 5 * direction;
      flight.object.traverse((child) => {
        if (child instanceof THREE.Sprite) child.material.rotation = flight.object.rotation.z;
      });
      flight.object.scale.setScalar(Math.max(0, 1 - elapsed * 1.1));
      flight.shadow.visible = false;
    }
  }

  private animateLanding(flight: Flight, bounds: TargetBounds, elapsed = 0): void {
    flight.landingAnimation?.cancel();
    const facing = facingFrom(bounds, flight.trick?.perform ? flight.start : flight.end);
    if (flight.trick?.perform || flight.landing?.act)
      flight.landingCard = { width: bounds.width, height: bounds.height, facing };
    const animation =
      flight.trick?.cardAnimation?.(facing) ?? flight.landing?.cardAnimation(facing, bounds);
    if (
      !animation ||
      (typeof animation.options.duration === 'number' && elapsed >= animation.options.duration)
    )
      return;
    flight.landingAnimation = flight.target.animate(animation.frames, animation.options);
    flight.landingAnimation.currentTime = elapsed;
    this.trackAnimation(flight.landingAnimation);
  }

  private impact(flight: Flight, now: number): void {
    if (flight.projectile.emoji === '🌈') {
      for (const animation of animateRainbowCard(flight.target)) this.trackAnimation(animation);
    }
    const direction = Math.sign(flight.end.x - flight.start.x) || 1;
    const mode = projectileStyle(flight.projectile.emoji)[4];
    const force = ['float', 'flutter', 'hover', 'pulse'].includes(mode) ? 0.3 : 1;
    const animation = flight.target.animate(
      [
        { translate: '0 0', rotate: '0deg' },
        {
          translate: `${direction * 7 * force}px 3px`,
          rotate: `${direction * 5 * force}deg`,
          offset: 0.14,
        },
        {
          translate: `${-direction * 3 * force}px -2px`,
          rotate: `${-direction * 2 * force}deg`,
          offset: 0.42,
        },
        { translate: '0 0', rotate: '0deg' },
      ],
      { duration: 470, easing: 'cubic-bezier(.2,.7,.3,1)' },
    );
    this.trackAnimation(animation);
    this.fragments.emit(
      {
        emoji: flight.projectile.emoji,
        id: flight.projectile.id,
        end: flight.end,
        direction,
        target: flight.target,
      },
      now,
    );
  }

  private trackAnimation(animation: Animation) {
    this.animations.add(animation);
    void animation.finished.then(
      () => this.animations.delete(animation),
      () => this.animations.delete(animation),
    );
  }

  private removeFlight(flight: Flight) {
    flight.landingAnimation?.cancel();
    if (flight.trick) {
      flight.trick.dispose?.();
      disposeObject(flight.trick.object);
    }
    flight.landing?.release();

    if (flight.landing) disposeObject(flight.landing.object);
    disposeObject(flight.object);
    disposeObject(flight.shadow);
  }

  private clear() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const flight of this.flights) this.removeFlight(flight);
    this.fragments.clear();
    this.flights.length = 0;
    this.trails.clear();
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
    this.renderer.clear();
  }

  dispose(): void {
    this.destroyed = true;
    this.clear();
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.visibility);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.renderer.dispose();
  }
}
