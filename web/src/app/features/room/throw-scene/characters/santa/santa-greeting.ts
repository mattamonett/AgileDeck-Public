import * as THREE from 'three';

/** Bubble canvas size; the sprite keeps this aspect. */
export const BUBBLE_W = 640,
  BUBBLE_H = 230;
const GREETING_LINES = ['Ho ho ho!', 'Merry Christmas!'] as const;
export const SANTA_GREETING = GREETING_LINES.join(' ');

/** The thought bubble, drawn once into a canvas texture that is disposed through `material.map`. */
export function santaGreeting(): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = BUBBLE_W;
    canvas.height = BUBBLE_H;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fffaf0';
      ctx.strokeStyle = '#b13140';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(6, 6, 628, 184, 60);
      ctx.fill();
      ctx.stroke();
      for (const [x, y, r] of [
        [320, 202, 12],
        [306, 222, 6],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#8d2332';
      ctx.font = 'bold 47px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      GREETING_LINES.forEach((line, i) => ctx.fillText(line, 320, 67 + i * 60));
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
  }
  const bubble = new THREE.Sprite(material);
  bubble.name = 'santa-greeting';
  bubble.userData['text'] = SANTA_GREETING;
  bubble.renderOrder = 10;
  bubble.visible = false;
  return bubble;
}
