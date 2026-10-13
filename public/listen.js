import { attachWater } from './water.js';

const session = { current: null, seen: [] };

export function attachListening(main, { api, t, escape, icon, reaction, bindCards, moodLabel }) {
  let disposed = false, loading = false, moving = false, drag = null;
  const tr = key => escape(t(key));
  main.innerHTML = `<section class="listening"><div class="listen-ink" aria-hidden="true"><canvas id="listen-water" tabindex="-1"></canvas></div>
    <header class="listen-heading"><h1>${tr('listenTitle')}</h1><p>${tr('listenIntro')}</p></header>
    <div class="listen-stage" id="listen-stage" aria-live="polite" aria-busy="true"></div>
    <details class="listen-options"><summary>${tr('listenOptions')}</summary><a href="#archive">${tr('listenArchive')}</a></details></section>`;
  const stopWater = attachWater(document.querySelector('#listen-water'), document.querySelector('#motion-toggle'), t);
  const stage = document.querySelector('#listen-stage');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function markSeen(id) {
    session.seen = [...session.seen.filter(item => item !== id), id].slice(-120);
  }
  function render(focus = false) {
    const letter = session.current;
    stage.setAttribute('aria-busy', 'false');
    const date = new Intl.DateTimeFormat(document.documentElement.lang, { month: 'short', day: 'numeric' }).format(new Date(letter.created));
    stage.innerHTML = `<article class="listen-card" tabindex="0" aria-label="${tr('listenCard')}" aria-describedby="listen-hint">
      <div class="listen-meta"><span>${escape(moodLabel(letter.mood))}</span><span>${escape(date)}</span></div>
      <p class="listen-body ${letter.body.length > 110 ? 'long-note' : ''}">${escape(letter.body)}</p>
      <div class="listen-signature"><span>${tr('stranger')}</span><button class="report text-button" data-id="${escape(letter.id)}">${tr('report')}</button></div>
      </article><div class="listen-actions">${reaction(letter)}<button class="button secondary" id="listen-next">${tr('listenNext')}${icon.arrow}</button></div>
      <p class="listen-hint" id="listen-hint">${tr('listenHint')}</p>`;
    bindCards();
    const card = stage.querySelector('.listen-card');
    stage.querySelector('#listen-next').onclick = () => advance(1);
    card.onkeydown = event => {
      if (event.target !== card || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); advance(event.key === 'ArrowLeft' ? -1 : 1);
    };
    card.onpointerdown = event => {
      if (event.target.closest('button') || !event.isPrimary || event.button !== 0 || loading || moving) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, active: false };
    };
    card.onpointermove = event => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.active && Math.abs(dy) > 16 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      if (!drag.active && Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        drag.active = true; card.setPointerCapture(event.pointerId); card.classList.add('dragging');
      }
      if (drag.active && !reduced()) {
        card.style.transform = `translateX(${dx * .7}px) rotate(${Math.max(-7, Math.min(7, dx / 40))}deg)`;
      }
    };
    function release(event, cancelled = false) {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      const shouldAdvance = !cancelled && drag.active && Math.abs(dx) > Math.min(95, card.clientWidth * .22);
      drag = null; card.classList.remove('dragging'); card.style.transform = '';
      if (card.hasPointerCapture(event.pointerId)) card.releasePointerCapture(event.pointerId);
      if (shouldAdvance) advance(Math.sign(dx));
    }
    card.onpointerup = event => release(event);
    card.onpointercancel = event => release(event, true);
    card.onpointerleave = () => { if (drag && !drag.active) drag = null; };
    if (focus) card.focus({ preventScroll: true });
  }
  function empty() {
    const seen = session.seen.length > 0;
    stage.innerHTML = `<div class="listen-rest"><div class="rest-mark">${icon.mark}</div><h2>${tr(seen ? 'listenEnd' : 'listenEmpty')}</h2><p>${tr(seen ? 'listenEndBody' : 'listenEmptyBody')}</p>
      ${seen ? `<button class="button secondary" id="listen-again">${tr('listenAgain')}</button>` : `<a class="button primary" href="#write">${tr('write')}</a>`}</div>`;
    stage.querySelector('#listen-again')?.addEventListener('click', () => { session.seen = []; fetchNext(true); });
  }
  async function fetchNext(focus = false) {
    if (loading || disposed) return;
    loading = true; stage.setAttribute('aria-busy', 'true');
    stage.innerHTML = `<p class="listen-loading">${tr('loading')}</p>`;
    try {
      const result = await api('listen?exclude=' + encodeURIComponent(session.seen.join(',')));
      if (disposed) return;
      session.current = result.letter;
      if (session.current) { markSeen(session.current.id); render(focus); }
      else { empty(); if (focus) stage.querySelector('button,a')?.focus({ preventScroll: true }); }
    } catch {
      if (disposed) return;
      stage.innerHTML = `<div class="listen-rest"><p>${tr('loadError')}</p><button class="button secondary" id="listen-retry">${tr('retry')}</button></div>`;
      stage.querySelector('#listen-retry').onclick = () => fetchNext(true);
      if (focus) stage.querySelector('#listen-retry').focus({ preventScroll: true });
    } finally {
      loading = false;
      if (!disposed) stage.setAttribute('aria-busy', 'false');
    }
  }
  async function advance(direction) {
    if (loading || moving || disposed) return;
    moving = true;
    const card = stage.querySelector('.listen-card');
    stage.querySelectorAll('.listen-actions button').forEach(button => button.disabled = true);
    if (card && !reduced()) {
      await card.animate([{ opacity: 1, transform: 'translateX(0) rotate(0)' }, { opacity: 0, transform: `translateX(${direction * 130}px) rotate(${direction * 5}deg)` }], { duration: 230, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
    }
    moving = false;
    if (disposed) return;
    session.current = null; await fetchNext(true);
  }
  stage.addEventListener('heard', event => {
    if (session.current?.id === event.target.dataset.id) session.current.reactions = ['heard'];
  });
  stage.addEventListener('reported', event => {
    if (session.current?.id === event.target.dataset.id) advance(1);
  });
  if (session.current) render(); else fetchNext();
  return () => { disposed = true; drag = null; stopWater(); };
}
