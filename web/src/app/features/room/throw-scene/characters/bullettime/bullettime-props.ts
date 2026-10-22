import * as THREE from 'three';
import { glow, part } from '../../kit';

export const GREEN = 0x35e07a,
  PALE_GREEN = 0xc8ffd8;

const BUBBLE_H = 150;

/** A white-edged thought bubble drawn into a canvas texture that is disposed through `material.map`. */
export function bulletBubble(text: string, name: string): THREE.Sprite {
  const width = Math.round(110 + text.length * 34);
  const material = new THREE.SpriteMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = BUBBLE_H;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f4fff7';
      ctx.strokeStyle = '#1f7a45';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(6, 6, width - 12, 104, 52);
      ctx.fill();
      ctx.stroke();
      for (const [x, y, r] of [
        [width * 0.5, 122, 9],
        [width * 0.5 + 10, 138, 5],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#12502c';
      ctx.font = 'bold 54px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, width / 2, 59);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
  }
  const bubble = new THREE.Sprite(material);
  bubble.name = name;
  bubble.userData['text'] = text;
  bubble.userData['aspect'] = width / BUBBLE_H;
  bubble.renderOrder = 10;
  bubble.visible = false;
  return bubble;
}

/** Columns of green glyphs on a transparent sheet that scrolls down the card face. */
export function codeSheet(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const glyphs = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜ0123456789';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      let seed = 11;
      const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let col = 0; col < 8; col++)
        for (let row = 0; row < 12; row++) {
          if (next() < 0.32) continue;
          // Each column brightens toward its leading glyph, like falling rain.
          const lead = (row + col * 5) % 12;
          ctx.fillStyle =
            lead === 0 ? '#d9ffe6' : `rgba(41, 214, 106, ${(0.35 + 0.6 * next()).toFixed(2)})`;
          ctx.fillText(
            glyphs.charAt(Math.floor(next() * glyphs.length)),
            8 + col * 15,
            18 + row * 20,
          );
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapT = THREE.RepeatWrapping;
    material.map = texture;
  } else material.color.setHex(GREEN);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  sheet.name = 'bullettime-card-code';
  sheet.visible = false;
  return sheet;
}

/** A falling streak of code: a thin green trail with a bright leading head. */
export function codeStreak(name: string): THREE.Group {
  const streak = new THREE.Group();
  streak.name = name;
  part(streak, `${name}-trail`, new THREE.PlaneGeometry(1, 1), glow(GREEN, 0.8), 0, 0.5, 0);
  part(
    streak,
    `${name}-head`,
    new THREE.PlaneGeometry(1, 1),
    glow(PALE_GREEN, 1),
    0,
    0,
    0.1,
  ).scale.set(1.5, 0.16, 1);
  streak.visible = false;
  return streak;
}

/** An impact flash: a quick ring with a four-point star where a blow lands. */
export function impactSpark(name: string): THREE.Group {
  const spark = new THREE.Group();
  spark.name = name;
  part(spark, `${name}-ring`, new THREE.RingGeometry(0.72, 1, 24), glow(PALE_GREEN, 0.9));
  for (const turn of [0.25, 0.75]) {
    const ray = part(
      spark,
      `${name}-ray-${turn}`,
      new THREE.PlaneGeometry(1, 1),
      glow(0xffffff, 1),
      0,
      0,
      0.1,
    );
    ray.scale.set(2.6, 0.22, 1);
    ray.rotation.z = Math.PI * turn;
  }
  spark.visible = false;
  return spark;
}
