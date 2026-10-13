export const swipeThreshold = width => width * .65;

export function attachCardDrag(card, { next, blocked, reduced, target = window }) {
  let drag = null;
  function reset() {
    const id = drag?.id;
    drag = null;
    card.classList.remove('dragging');
    card.style.transform = '';
    if (id !== undefined && card.hasPointerCapture?.(id)) card.releasePointerCapture(id);
  }
  function start(event) {
    if (event.target.closest('button,a') || event.isPrimary === false || event.button !== 0 || blocked()) return;
    const mouse = event.pointerType === 'mouse';
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, width: card.clientWidth, active: mouse, dx: 0, dy: 0 };
    if (mouse) {
      event.preventDefault(); card.focus({ preventScroll: true });
      card.classList.add('dragging');
    }
    // Window listeners remain the fallback if a browser cannot capture this pointer.
    try { card.setPointerCapture(event.pointerId); } catch {}
  }
  function move(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.active && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { reset(); return; }
    if (!drag.active && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      drag.active = true; card.classList.add('dragging');
    }
    drag.dx = dx; drag.dy = dy;
    if (!drag.active) return;
    // Direct pointer tracking is always 1:1, including reduced-motion mode.
    card.style.transform = `translate3d(${dx}px, ${reduced() ? 0 : dy * .12}px, 0) rotate(${reduced() ? 0 : Math.max(-9, Math.min(9, dx / 40))}deg)`;
  }
  function release(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const { dx, dy, width, active, id } = drag;
    const commit = active && Math.abs(dx) >= swipeThreshold(width) && Math.abs(dx) > Math.abs(dy) * 1.25;
    drag = null; card.classList.remove('dragging');
    if (card.hasPointerCapture?.(id)) card.releasePointerCapture(id);
    if (commit) next(Math.sign(dx));
    else card.style.transform = '';
  }
  function cancel(event) { if (drag && (event.type === 'blur' || event.pointerId === drag.id)) reset(); }
  const preventNativeDrag = event => event.preventDefault();
  card.addEventListener('pointerdown', start);
  card.addEventListener('dragstart', preventNativeDrag);
  target.addEventListener('pointermove', move, true);
  target.addEventListener('pointerup', release, true);
  target.addEventListener('pointercancel', cancel, true);
  target.addEventListener('blur', cancel);
  return () => {
    reset();
    card.removeEventListener('pointerdown', start);
    card.removeEventListener('dragstart', preventNativeDrag);
    target.removeEventListener('pointermove', move, true);
    target.removeEventListener('pointerup', release, true);
    target.removeEventListener('pointercancel', cancel, true);
    target.removeEventListener('blur', cancel);
  };
}
