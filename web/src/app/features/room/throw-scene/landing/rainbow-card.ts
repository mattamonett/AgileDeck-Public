const activeTints = new WeakMap<HTMLElement, Animation[]>();

/** Tint both faces so a reveal during the effect preserves the rainbow and vote. */
export function animateRainbowCard(target: HTMLElement): Animation[] {
  for (const previous of activeTints.get(target) ?? []) previous.cancel();
  const faces = Array.from(
    target.querySelectorAll<HTMLElement>('.garden-card-back, .garden-card-front'),
  );
  const animations = (faces.length ? faces : [target]).map((face) => {
    const overlay = document.createElement('span');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.dataset['rainbowTint'] = '';
    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      borderRadius: 'inherit',
      pointerEvents: 'none',
      zIndex: '20',
      transform: 'none',
      backgroundImage:
        'linear-gradient(125deg, #ff497b, #ff9b45, #ffe66b, #64e69a, #57c8ff, #a17aff, #ff497b)',
      backgroundSize: '200% 200%',
      opacity: '0',
    });
    face.appendChild(overlay);
    const animation = overlay.animate(
      [
        { opacity: 0, backgroundPosition: '0% 50%', offset: 0 },
        { opacity: 0.72, backgroundPosition: '25% 50%', offset: 0.12 },
        { opacity: 0.65, backgroundPosition: '80% 50%', offset: 0.55 },
        { opacity: 0, backgroundPosition: '100% 50%', offset: 1 },
      ],
      { duration: 1800, easing: 'ease-in-out' },
    );
    void animation.finished.then(
      () => overlay.remove(),
      () => overlay.remove(),
    );
    return animation;
  });
  activeTints.set(target, animations);
  return animations;
}
