import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachCardDrag, swipeThreshold } from '../public/card-drag.js';

function setup({ reduced = false, width = 580, captureFails = false } = {}) {
  const target = new EventTarget(), card = new EventTarget(), calls = [];
  const classes = new Set();
  Object.assign(card, {
    clientWidth: width, style: {}, closest: () => null, focus() {},
    classList: { add: x => classes.add(x), remove: x => classes.delete(x) },
    setPointerCapture() { if (captureFails) throw Error('capture unavailable'); },
    hasPointerCapture: () => false
  });
  const cleanup = attachCardDrag(card, { next: direction => calls.push(direction), blocked: () => false, reduced: () => reduced, target });
  const emit = (type, x, y = 0, pointerType = 'mouse') => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType, isPrimary: true, button: 0, clientX: x, clientY: y });
    (type === 'pointerdown' ? card : target).dispatchEvent(event);
  };
  return { card, calls, cleanup, emit, classes };
}

test('mouse follows each move even without pointer capture and with reduced motion', () => {
  const { card, calls, cleanup, emit, classes } = setup({ reduced: true, captureFails: true });
  emit('pointerdown', 100); emit('pointermove', 260);
  assert.equal(card.style.transform, 'translate3d(160px, 0px, 0) rotate(0deg)');
  assert.ok(classes.has('dragging'));
  emit('pointermove', 350); emit('pointerup', 350);
  assert.equal(card.style.transform, ''); assert.deepEqual(calls, []);
  cleanup(); emit('pointermove', 700); assert.equal(card.style.transform, '');
});

test('only a deliberate drag past 65% advances, in either direction', () => {
  for (const width of [320, 580]) for (const direction of [-1, 1]) {
    const { emit, calls, cleanup } = setup({ width });
    emit('pointerdown', 0); emit('pointermove', direction * (swipeThreshold(width) - 1)); emit('pointerup', direction * (swipeThreshold(width) - 1));
    assert.deepEqual(calls, []);
    emit('pointerdown', 0); emit('pointermove', direction * (swipeThreshold(width) + 1)); emit('pointerup', direction * (swipeThreshold(width) + 1));
    assert.deepEqual(calls, [direction]); cleanup();
  }
});

test('vertical scrolling, cancelled gestures and window blur never advance', () => {
  const { card, emit, calls, cleanup } = setup({ width: 320 });
  emit('pointerdown', 0, 0, 'touch'); emit('pointermove', 5, 50, 'touch'); emit('pointerup', 300, 50, 'touch');
  emit('pointerdown', 0); emit('pointermove', 300); emit('pointercancel', 300);
  emit('pointerdown', 0); emit('pointermove', 300); emit('blur', 300);
  assert.deepEqual(calls, []); assert.equal(card.style.transform, ''); cleanup();
});
