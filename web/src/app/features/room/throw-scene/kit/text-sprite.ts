import * as THREE from 'three';

/** A caption, or a speech bubble when `bubble` is set, drawn to a canvas sprite. Null outside a browser. */
export function textSprite(lines: readonly string[], bubble: boolean): THREE.Sprite | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (bubble) {
    ctx.fillStyle = '#fffdf5';
    ctx.strokeStyle = '#263744';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(5, 5, 630, 200, 55);
    ctx.fill();
    ctx.stroke();
    for (const [x, y, r] of [
      [300, 222, 13],
      [320, 247, 6],
    ]) {
      if (x === undefined || y === undefined || r === undefined) continue;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.fillStyle = bubble ? '#263744' : '#ffffff';
  ctx.font = bubble ? 'bold 49px Arial' : 'bold 80px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) =>
    ctx.fillText(line, 320, (bubble ? 103 : 128) + (i - (lines.length - 1) / 2) * 64),
  );
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map, depthTest: false, depthWrite: false }),
  );
  sprite.scale.set(bubble ? 192 : 25, bubble ? 77 : 10, 1);
  return sprite;
}
