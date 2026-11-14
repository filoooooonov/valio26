const closing = new WeakSet<HTMLElement>();

// Keep the popup mounted while its exit plays; reduced motion closes immediately.
export function closePopup(element: HTMLElement | null, finish: () => void) {
  if (!element) { finish(); return; }
  if (closing.has(element)) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
  closing.add(element);
  element.dataset.popupClosing = 'true';
  const style = getComputedStyle(element);
  const animation = element.animate([
    { opacity: style.opacity, transform: style.transform === 'none' ? 'translateY(0) scale(1)' : style.transform },
    { opacity: 0, transform: 'translateY(10px) scale(.985)' },
  ], { duration: 200, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
  void animation.finished.then(() => {
    finish();
    requestAnimationFrame(() => { animation.cancel(); delete element.dataset.popupClosing; closing.delete(element); });
  }).catch(() => { delete element.dataset.popupClosing; closing.delete(element); });
}
