/**
 * A short burst of falling confetti, ported from the mockup's `confetti()`.
 *
 * Deliberately a no-op when motion is not wanted or not possible: it refuses to run under
 * `prefers-reduced-motion`, and it bails out when `Element.prototype.animate` is missing
 * (e.g. jsdom), so tests and reduced-motion users never see stray `<i class="confetti">`
 * elements left in the document.
 */
const PALETTE = ['#ffe14d', '#ff8fc7', '#7cc6ff', '#6ee7a8', '#ff9f6b', '#e5383b'];

export function confetti(x: number, y: number, n = 40): void {
  if (typeof window === 'undefined' || typeof Element === 'undefined') return;
  if (typeof Element.prototype.animate !== 'function') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;

  for (let i = 0; i < n; i++) {
    const el = document.createElement('i');
    el.className = 'confetti';
    el.style.background = PALETTE[i % PALETTE.length];
    document.body.append(el);
    const angle = Math.random() * Math.PI * 2;
    const velocity = 120 + Math.random() * 260;
    const animation = el.animate(
      [
        { transform: `translate(${x}px, ${y}px) rotate(0)`, opacity: 1 },
        {
          transform: `translate(${x + Math.cos(angle) * velocity}px, ${y + Math.sin(angle) * velocity + 300}px) rotate(${Math.random() * 720}deg)`,
          opacity: 0,
        },
      ],
      { duration: 1100 + Math.random() * 600, easing: 'cubic-bezier(.2,.6,.4,1)' },
    );
    animation.onfinish = () => el.remove();
  }
}
