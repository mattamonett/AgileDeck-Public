import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  blobShape,
  cardPoint,
  cardTurn,
  clamp,
  ease,
  glow,
  mix,
  part,
  setStrip,
  stripGeometry,
  type CardPose,
  type Side,
} from '../../kit';
import { piechefCardPose, piechefPeel, type PiechefPlan } from './piechef-choreography';
import { PIE_FACE, PIE_RADIUS } from './piechef-model';

const FILLING = 0xe48a3c,
  FILLING_DARK = 0xc56b2c,
  CREAM = 0xfff4e2,
  CRUST = 0xcf9548;

/** The layout of one frame: where the chef stands and where the pie meets the card. */
export interface PiechefStage {
  readonly side: Side;
  readonly scale: number;
  readonly fit: number;
  readonly floor: number;
  readonly stand: Point;
  /** Unanimated card point where the filling face lands. */
  readonly contact: Point;
  readonly b: TargetBounds;
}
interface Stream {
  readonly strip: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly head: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  readonly x: number;
  readonly width: number;
  readonly delay: number;
  readonly length: number;
  readonly reach: number;
  readonly cream: boolean;
  readonly drops: readonly THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[];
}
interface Speck {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly angle: number;
  readonly distance: number;
  readonly size: number;
}
interface Strand {
  readonly card: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly tin: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly local: THREE.Vector3;
  readonly snap: number;
}

const wet = (color: number, opacity = 1) => glow(color, opacity);

/** The pie's mess on the card: the splat and its crust, flecks and crumbs, runoff and puddles, and strands to the tin. */
export class PiechefMess {
  private readonly splatEdge: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  private readonly splat: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  private readonly sheen: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  private readonly smear: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  private readonly creams: Speck[] = [];
  private readonly crust: Speck[] = [];
  private readonly crustArcs: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly flecks: Speck[] = [];
  private readonly crumbs: Speck[] = [];
  private readonly streams: Stream[] = [];
  private readonly strands: Strand[] = [];
  private readonly puddle: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private readonly creamPuddle: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

  constructor(
    parent: THREE.Object3D,
    private readonly plan: PiechefPlan,
    private readonly pie: THREE.Object3D,
    private readonly cardZ: number,
    private readonly faceZ: number,
  ) {
    this.puddle = part(
      parent,
      'piechef-puddle',
      new THREE.CircleGeometry(1, 24),
      wet(FILLING_DARK, 0.85),
    );
    this.creamPuddle = part(
      parent,
      'piechef-cream-puddle',
      new THREE.CircleGeometry(1, 18),
      wet(CREAM, 0.9),
    );
    const p = plan;
    const r = seededRandom(`${p.phase}:piechef-mess`);
    this.splatEdge = part(
      parent,
      'piechef-splat-edge',
      new THREE.ShapeGeometry(blobShape(p.phase + 0.7, 5, 0.09)),
      wet(FILLING_DARK),
    );
    this.splat = part(
      parent,
      'piechef-splat',
      new THREE.ShapeGeometry(blobShape(p.phase, 5, 0.08)),
      wet(FILLING),
    );
    this.sheen = part(
      parent,
      'piechef-sheen',
      new THREE.ShapeGeometry(blobShape(p.phase * 2, 3, 0.1)),
      wet(0xf3b178, 0.6),
    );
    this.smear = part(
      parent,
      'piechef-smear',
      new THREE.ShapeGeometry(blobShape(p.phase + 2, 4, 0.15)),
      wet(0xd2702a, 0.8),
    );
    const speck = (
      name: string,
      color: number,
      angle: number,
      distance: number,
      size: number,
      lobes = 3,
      rough = 0.14,
    ): Speck => ({
      mesh: part(
        parent,
        name,
        new THREE.ShapeGeometry(blobShape(angle * 3, lobes, rough)),
        wet(color),
      ),
      angle,
      distance,
      size,
    });
    // The whipped-cream crown lands in the middle of the filling, with a couple of smaller dabs.
    for (let i = 0; i < 3; i++)
      this.creams.push(
        speck(
          `piechef-cream-${i}`,
          CREAM,
          r() * Math.PI * 2,
          i ? 0.42 + r() * 0.15 : r() * 0.1,
          i ? 0.16 + r() * 0.06 : 0.4 + r() * 0.08,
          5,
          0.12,
        ),
      );
    // Broken arcs of crust stay stuck around the rim of the splat.
    for (let i = 0; i < 2; i++) {
      const start = p.phase + i * Math.PI + r() * 0.8;
      this.crustArcs.push(
        part(
          parent,
          `piechef-crust-arc-${i}`,
          new THREE.RingGeometry(0.84, 1, 20, 1, start, 1.3 + r() * 0.8),
          wet(CRUST),
        ),
      );
    }
    for (let i = 0; i < 3; i++)
      this.crust.push(
        speck(
          `piechef-crust-${i}`,
          CRUST,
          p.phase + 2.2 + i * 2.1 + r() * 0.5,
          0.93 + r() * 0.08,
          0.1 + r() * 0.04,
          3,
          0.2,
        ),
      );
    // Flecks fly sideways and down from the impact, so the value above stays clear.
    for (let i = 0; i < 6; i++)
      this.flecks.push(
        speck(
          `piechef-fleck-${i}`,
          i % 3 ? FILLING : CREAM,
          -0.3 + r() * (Math.PI + 0.6),
          4 + r() * 8,
          0.7 + r() * 0.6,
          3,
          0.06,
        ),
      );
    for (let i = 0; i < 4; i++)
      this.crumbs.push(
        speck(
          `piechef-crumb-${i}`,
          CRUST,
          0.4 + r() * (Math.PI - 0.8),
          (r() * 2 - 1) * 18,
          1 + r() * 0.6,
        ),
      );
    // Stream positions across the splat, shuffled so filling and cream run in a different order each time.
    const slots = [-0.62, -0.3, 0.02, 0.34, 0.6];
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1)),
        a = slots[i],
        b = slots[j];
      if (a !== undefined && b !== undefined) {
        slots[i] = b;
        slots[j] = a;
      }
    }
    for (let i = 0; i < 5; i++) {
      const cream = i >= 3;
      const strip = part(
        parent,
        `piechef-runoff-${i}`,
        stripGeometry(14),
        wet(cream ? CREAM : i % 2 ? FILLING_DARK : FILLING),
      );
      const head = part(
        parent,
        `piechef-runoff-head-${i}`,
        new THREE.CircleGeometry(1, 14),
        wet(cream ? CREAM : FILLING),
      );
      const dropCount = cream ? (i === 3 ? 1 : 0) : 2;
      const drops = Array.from({ length: dropCount }, (_, j) =>
        part(
          parent,
          `piechef-drop-${i}-${j}`,
          new THREE.CircleGeometry(1, 12),
          wet(cream ? CREAM : FILLING),
        ),
      );
      this.streams.push({
        strip,
        head,
        x: slots[i] ?? 0,
        width: cream ? 2.4 + r() * 0.5 : 1.3 + r() * 0.9,
        delay: 120 + i * 110 + r() * 60,
        length: (cream ? 1.45 : 0.85) + r() * 0.3,
        reach: cream && i === 4 ? 0.55 + r() * 0.2 : 1,
        cream,
        drops,
      });
    }
    for (let j = 0; j < 3; j++) {
      const a = (j / 3) * Math.PI * 2 + r();
      this.strands.push({
        card: part(parent, `piechef-strand-card-${j}`, stripGeometry(8), wet(FILLING)),
        tin: part(parent, `piechef-strand-tin-${j}`, stripGeometry(8), wet(FILLING)),
        local: new THREE.Vector3(
          Math.cos(a) * PIE_RADIUS * (0.3 + 0.3 * r()),
          PIE_FACE,
          Math.sin(a) * PIE_RADIUS * (0.3 + 0.3 * r()),
        ),
        snap: 0.45 + j * 0.2 + r() * 0.08,
      });
    }
  }

  update(ms: number, s: PiechefStage, q: CardPose) {
    this.updateSplat(ms, s, q);
    this.updateRunoff(ms, s, q);
    this.updateStrands(ms, s, q);
  }

  private specks(list: readonly Speck[], visible: boolean, fade: number) {
    for (const s of list) {
      s.mesh.visible = visible && fade > 0;
      s.mesh.material.opacity = fade;
    }
  }

  private updateSplat(ms: number, s: PiechefStage, q: CardPose) {
    const p = this.plan;
    const fade = 1 - ease((ms - p.exitEnd) / 500);
    const live = ms >= p.splat && fade > 0;
    const grow = mix(0.55, 1, ease((ms - p.splat) / 140));
    const rx = 1.18 * PIE_RADIUS * s.scale * (0.92 + 0.12 * p.strength) * grow,
      ry = rx * 0.92;
    // The filling slowly sags under its own weight.
    const sag = 0.05 * s.b.height * ease((ms - p.splat - 400) / 3200);
    const centre = { x: s.contact.x, y: s.contact.y + sag * 0.5 };
    const turn = cardTurn(q);
    const place = (mesh: THREE.Mesh, raw: Point, z: number, sx: number, sy: number, spin = 0) => {
      const at = cardPoint(q, raw, s.b);
      mesh.position.set(at.x, -at.y, z);
      mesh.rotation.z = turn + spin;
      mesh.scale.set(Math.max(0.001, sx), Math.max(0.001, sy), 1);
    };
    for (const mesh of [this.splatEdge, this.splat]) {
      mesh.visible = live;
      mesh.material.opacity = 0.95 * fade;
    }
    place(this.splatEdge, centre, this.cardZ, rx * 1.07 * q.sx, (ry + sag) * 1.07 * q.sy, p.phase);
    place(this.splat, centre, this.cardZ + 0.1, rx * q.sx, (ry + sag) * q.sy, p.phase);
    this.sheen.visible = live && ms >= p.peel;
    this.sheen.material.opacity = 0.55 * fade;
    place(
      this.sheen,
      { x: centre.x - rx * 0.3, y: centre.y - ry * 0.35 },
      this.cardZ + 0.3,
      rx * 0.32,
      ry * 0.18,
      -0.3,
    );
    this.specks(this.creams, live, fade);
    for (const c of this.creams)
      place(
        c.mesh,
        {
          x: centre.x + Math.cos(c.angle) * c.distance * rx,
          y: centre.y + Math.sin(c.angle) * c.distance * ry + sag * 0.3,
        },
        this.cardZ + 0.25,
        c.size * rx,
        c.size * ry * 0.85,
        c.angle,
      );
    for (const arc of this.crustArcs) {
      arc.visible = live;
      arc.material.opacity = fade;
      place(arc, centre, this.cardZ + 0.2, rx * q.sx, (ry + sag) * q.sy, 0);
    }
    this.specks(this.crust, live, fade);
    for (const c of this.crust)
      place(
        c.mesh,
        {
          x: centre.x + Math.cos(c.angle) * c.distance * rx,
          y: centre.y + Math.sin(c.angle) * c.distance * (ry + sag),
        },
        this.cardZ + 0.35,
        c.size * rx,
        c.size * rx * 0.7,
        c.angle,
      );
    // Flecks burst out at the impact and stick where they land on the card.
    this.specks(this.flecks, live, fade);
    const burst = ease((ms - p.splat) / 120);
    for (const f of this.flecks) {
      const d = rx * 0.85 + f.distance * s.fit * burst;
      const slide = 3 * s.fit * ease((ms - p.splat - 300) / 2200);
      place(
        f.mesh,
        { x: centre.x + Math.cos(f.angle) * d, y: centre.y + Math.sin(f.angle) * d + slide },
        this.cardZ + 0.4,
        f.size * s.fit,
        f.size * s.fit * (1 + 0.5 * (1 - burst)),
        f.angle,
      );
    }
    // The awkward wipe drags a streak of filling toward the middle of the card, below the value.
    const rubbed =
      p.recovery === 'wipe' ? ease((ms - p.recover - 250) / (p.recoverEnd - p.recover - 450)) : 0;
    this.smear.visible = live && rubbed > 0;
    this.smear.material.opacity = 0.8 * fade;
    place(
      this.smear,
      { x: centre.x + s.side * s.b.width * 0.07 * rubbed, y: centre.y + ry * 0.1 },
      this.cardZ + 0.05,
      rx * 0.7 + s.b.width * 0.1 * rubbed,
      ry * 0.42,
      0,
    );
    // Crust crumbs break off as the tin pops free and fall to the floor.
    const popped = piechefCardPose(p, p.peelEnd, s.side);
    const age = Math.max(0, ms - p.peelEnd) / 1000;
    this.specks(this.crumbs, ms >= p.peelEnd && fade > 0, fade);
    for (const c of this.crumbs) {
      const born = cardPoint(
        popped,
        { x: centre.x + Math.cos(c.angle) * rx, y: centre.y + Math.sin(c.angle) * ry },
        s.b,
      );
      const g = 900 * s.fit,
        size = c.size * s.fit;
      const land = Math.sqrt((2 * Math.max(0, s.floor - size - born.y)) / g);
      const t = Math.min(age, land);
      const bounce =
        age > land
          ? Math.abs(Math.sin(Math.min(Math.PI, (age - land) * 14))) *
            2.5 *
            s.fit *
            Math.exp(-(age - land) * 6)
          : 0;
      c.mesh.position.set(
        born.x + c.distance * s.fit * t,
        -(born.y + 0.5 * g * t * t - bounce),
        this.cardZ + 1,
      );
      c.mesh.rotation.z = c.angle + age * 4 * (age < land ? 1 : 0);
      c.mesh.scale.set(size, size * 0.8, 1);
    }
  }

  /** Narrow streams run from the splat to the card's lower edge, drip off it, and pool on the floor. */
  private updateRunoff(ms: number, s: PiechefStage, q: CardPose) {
    const p = this.plan;
    const fade = 1 - ease((ms - p.exitEnd) / 500);
    const rx = 1.18 * PIE_RADIUS * s.scale * (0.92 + 0.12 * p.strength);
    const bottom = s.b.top + s.b.height - 0.4;
    let landed = 0,
      creamLanded = 0,
      sumX = 0,
      count = 0;
    for (const stream of this.streams) {
      const born = p.splat + stream.delay,
        duration = p.runoff * stream.length;
      const x0 = s.contact.x + stream.x * rx,
        y0 = s.contact.y + rx * 0.5;
      const full = Math.max(1, bottom - y0);
      const t = Math.max(0, ms - born) / duration;
      const length = full * stream.reach * clamp(t * t);
      const width = stream.width * s.fit;
      const live = ms >= born && length > 0.3 && fade > 0;
      stream.strip.visible = stream.head.visible = live;
      stream.strip.material.opacity = stream.head.material.opacity = 0.92 * fade;
      const point = (k: number) =>
        cardPoint(
          q,
          { x: x0 + Math.sin(k * 5 + stream.x * 7) * 0.5 * s.fit * k, y: y0 + k * length },
          s.b,
        );
      if (live) {
        setStrip(
          stream.strip.geometry,
          14,
          (k, out) => {
            const at = point(k);
            out.set(at.x, -at.y, this.cardZ + 0.2);
          },
          (k) => width * (1 - 0.3 * k),
        );
        const tip = point(1);
        // The leading bead swells while it hangs at the card edge.
        const hanging =
          t >= 1 && stream.reach >= 1
            ? 1 + 0.3 * Math.abs(Math.sin((ms - born - duration) / 160))
            : 1;
        stream.head.position.set(tip.x, -tip.y, this.cardZ + 0.3);
        stream.head.scale.set(width * 0.8 * hanging, width * 0.95 * hanging, 1);
      }
      const edge = p.splat + stream.delay + duration;
      stream.drops.forEach((drop, j) => {
        const detach = edge + 180 + j * 480;
        const from = cardPoint(piechefCardPose(p, detach, s.side), { x: x0, y: bottom }, s.b);
        const g = 900 * s.fit;
        const fallTime = Math.sqrt((2 * Math.max(0, s.floor - from.y)) / g);
        const age = (ms - detach) / 1000;
        drop.visible = age >= 0 && age < fallTime && fade > 0;
        drop.position.set(from.x, -(from.y + 0.5 * g * Math.max(0, age) ** 2), this.cardZ + 1);
        drop.scale.set(width * 0.75, width * 1.25, 1);
        drop.material.opacity = fade;
        if (age >= fallTime) {
          const splash = ease((age - fallTime) / 0.25);
          if (stream.cream) creamLanded += splash;
          else landed += splash;
          sumX += from.x;
          count++;
        }
      });
    }
    const x = count ? sumX / count : s.contact.x;
    this.puddle.visible = landed > 0 && fade > 0;
    this.puddle.position.set(x, -s.floor, this.cardZ + 0.5);
    this.puddle.scale.set((2.5 + 2.6 * landed) * s.fit, (0.8 + 0.25 * landed) * s.fit, 1);
    this.puddle.material.opacity = 0.85 * fade;
    this.creamPuddle.visible = creamLanded > 0 && fade > 0;
    this.creamPuddle.position.set(x + 1.5 * s.fit, -s.floor + 0.3 * s.fit, this.cardZ + 0.6);
    this.creamPuddle.scale.set(2.6 * creamLanded * s.fit, 0.8 * creamLanded * s.fit, 1);
    this.creamPuddle.material.opacity = 0.9 * fade;
  }

  /** Gooey strings stretch from the tin to the card as it peels, thin out, snap and retract. */
  private updateStrands(ms: number, s: PiechefStage, q: CardPose) {
    const p = this.plan;
    const peel = piechefPeel(p, ms);
    const active = ms >= p.peel && ms < p.peelEnd + 200;
    const popped = ease((ms - p.peelEnd) / 160);
    const tin = new THREE.Vector3();
    for (const strand of this.strands) {
      const raw = {
        x: s.contact.x + strand.local.x * s.scale,
        y: s.contact.y - strand.local.z * s.scale,
      };
      const card = cardPoint(q, raw, s.b);
      this.pie.localToWorld(tin.copy(strand.local));
      const snapped = peel >= strand.snap;
      const retract = Math.max(clamp((peel - strand.snap) / 0.15), popped);
      const width = (1.6 - 1.1 * clamp(peel / strand.snap)) * s.fit;
      strand.card.visible = active && retract < 1;
      strand.tin.visible = active && snapped && retract < 1;
      strand.card.material.opacity = strand.tin.material.opacity = 0.95;
      if (!strand.card.visible) continue;
      const dx = tin.x - card.x,
        dy = -tin.y - card.y;
      const reachOf = snapped ? 0.35 * (1 - retract) : 1;
      const sag = 3 * s.fit * clamp(peel / strand.snap);
      setStrip(
        strand.card.geometry,
        8,
        (k, out) =>
          out.set(
            card.x + dx * reachOf * k,
            -(card.y + dy * reachOf * k + Math.sin(Math.PI * k) * sag * (snapped ? 0.3 : 1)),
            this.faceZ + 0.5,
          ),
        (k) => width * (snapped ? 1 - 0.7 * k : 0.7 + 0.3 * Math.abs(1 - 2 * k)),
      );
      if (strand.tin.visible)
        setStrip(
          strand.tin.geometry,
          8,
          (k, out) =>
            out.set(
              tin.x - dx * reachOf * k,
              tin.y + dy * reachOf * k - k * 2 * s.fit,
              tin.z + 0.5,
            ),
          (k) => width * (1 - 0.7 * k),
        );
    }
  }
}
