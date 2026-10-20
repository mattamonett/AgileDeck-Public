export type Stroke = readonly (readonly [number, number])[];
// Coordinates are fractions of the whiteboard: start, decision, two branches, merge, end.
const shapes: Stroke[] = [
  [
    [0.34, 0.08],
    [0.66, 0.08],
    [0.66, 0.19],
    [0.34, 0.19],
    [0.34, 0.08],
  ],
  [
    [0.5, 0.19],
    [0.5, 0.29],
  ],
  [
    [0.47, 0.26],
    [0.5, 0.29],
    [0.53, 0.26],
  ],
  [
    [0.5, 0.29],
    [0.68, 0.4],
    [0.5, 0.51],
    [0.32, 0.4],
    [0.5, 0.29],
  ],
  [
    [0.32, 0.4],
    [0.18, 0.4],
    [0.18, 0.58],
  ],
  [
    [0.15, 0.55],
    [0.18, 0.58],
    [0.21, 0.55],
  ],
  [
    [0.68, 0.4],
    [0.82, 0.4],
    [0.82, 0.58],
  ],
  [
    [0.79, 0.55],
    [0.82, 0.58],
    [0.85, 0.55],
  ],
  [
    [0.06, 0.58],
    [0.32, 0.58],
    [0.32, 0.7],
    [0.06, 0.7],
    [0.06, 0.58],
  ],
  [
    [0.68, 0.58],
    [0.94, 0.58],
    [0.94, 0.7],
    [0.68, 0.7],
    [0.68, 0.58],
  ],
  [
    [0.18, 0.7],
    [0.18, 0.78],
    [0.5, 0.78],
    [0.5, 0.85],
  ],
  [
    [0.82, 0.7],
    [0.82, 0.78],
    [0.5, 0.78],
  ],
  [
    [0.47, 0.82],
    [0.5, 0.85],
    [0.53, 0.82],
  ],
  [
    [0.34, 0.85],
    [0.66, 0.85],
    [0.66, 0.95],
    [0.34, 0.95],
    [0.34, 0.85],
  ],
];

const glyphs: Readonly<Record<string, Stroke>> = {
  S: [
    [1, 1],
    [0, 1],
    [0, 0.5],
    [1, 0.5],
    [1, 0],
    [0, 0],
  ],
  T: [
    [0, 1],
    [1, 1],
    [0.5, 1],
    [0.5, 0],
  ],
  A: [
    [0, 0],
    [0.5, 1],
    [1, 0],
    [0.75, 0.5],
    [0.25, 0.5],
  ],
  R: [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0.5],
    [0, 0.5],
    [1, 0],
  ],
  O: [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ],
  K: [
    [0, 0],
    [0, 1],
    [0, 0.5],
    [1, 1],
    [0, 0.5],
    [1, 0],
  ],
  '?': [
    [0, 1],
    [1, 1],
    [1, 0.7],
    [0.5, 0.5],
    [0.5, 0.25],
    [0.5, 0],
  ],
  E: [
    [1, 0],
    [0, 0],
    [0, 0.5],
    [0.8, 0.5],
    [0, 0.5],
    [0, 1],
    [1, 1],
  ],
  Y: [
    [0, 1],
    [0.5, 0.5],
    [1, 1],
    [0.5, 0.5],
    [0.5, 0],
  ],
  U: [
    [0, 1],
    [0, 0],
    [1, 0],
    [1, 1],
  ],
  N: [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ],
  D: [
    [0, 0],
    [0, 1],
    [0.7, 1],
    [1, 0.75],
    [1, 0.25],
    [0.7, 0],
    [0, 0],
  ],
};
function label(text: string, x: number, y: number): Stroke[] {
  const width = 0.03,
    gap = 0.009,
    height = 0.05;
  const start = x - (text.length * width + (text.length - 1) * gap) / 2;
  return [...text].flatMap((letter, index) => {
    const path = glyphs[letter];
    return path
      ? [
          path.map(
            ([px, py]) =>
              [start + index * (width + gap) + px * width, y + (0.5 - py) * height] as const,
          ),
        ]
      : [];
  });
}
export const architectStrokes: readonly Stroke[] = shapes.flatMap((stroke, index) => {
  const text =
    index === 0
      ? label('START', 0.5, 0.135)
      : index === 3
        ? label('OK?', 0.5, 0.4)
        : index === 8
          ? label('RETRY', 0.19, 0.64)
          : index === 9
            ? label('RUN', 0.81, 0.64)
            : index === 13
              ? label('END', 0.5, 0.9)
              : [];
  return [stroke, ...text];
});
export function strokeLength(stroke: Stroke) {
  let length = 0;
  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1],
      b = stroke[i];
    if (a && b) length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}
export function strokePoint(stroke: Stroke, progress: number): readonly [number, number] {
  const first = stroke[0];
  if (!first) return [0.5, 0.5];
  let remaining = Math.max(0, Math.min(1, progress)) * strokeLength(stroke);
  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1],
      b = stroke[i];
    if (!a || !b) continue;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (remaining <= length) {
      const t = length ? remaining / length : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    remaining -= length;
  }
  return stroke.at(-1) ?? first;
}
