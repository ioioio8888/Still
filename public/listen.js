import { attachCardDrag } from './card-drag.js';

const session = { current: null, seen: [] };

export function attachListening(main, { api, t, escape, icon, reaction, bindCards, moodLabel }) {
  let disposed = false, loading = false, moving = false, cleanupDrag = () => {};
  const tr = key => escape(t(key));
  main.innerHTML = `<section class="listening">
    <header class="listen-heading"><h1>${tr('listenTitle')}</h1><p>${tr('listenIntro')}</p></header>
    <div class="listen-stage" id="listen-stage" aria-live="polite" aria-busy="true"></div>
    <a class="listen-compose button primary" href="#write">${tr('write')}${icon.arrow}</a>
    <p class="ink-hint" id="water-hint">${tr('waterHint')}</p>
    <details class="listen-options"><summary>${tr('listenOptions')}</summary><a href="#archive">${tr('listenArchive')}</a></details></section>`;
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
    cleanupDrag();
    cleanupDrag = attachCardDrag(card, { next: advance, blocked: () => loading || moving || disposed, reduced });
    if (focus) card.focus({ preventScroll: true });
  }
  function empty() {
    const seen = session.seen.length > 0;
    stage.innerHTML = `<div class="listen-rest"><div class="rest-mark">${icon.mark}</div><h2>${tr(seen ? 'listenEnd' : 'listenEmpty')}</h2><p>${tr(seen ? 'listenEndBody' : 'listenEmptyBody')}</p>
      ${seen ? `<button class="button secondary" id="listen-again">${tr('listenAgain')}</button>` : ''}</div>`;
    stage.querySelector('#listen-again')?.addEventListener('click', () => { session.seen = []; fetchNext(true); });
  }
  async function fetchNext(focus = false) {
    if (loading || disposed) return;
    cleanupDrag(); cleanupDrag = () => {};
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
      const start = card.style.transform || 'translateX(0) rotate(0)';
      await card.animate([{ opacity: 1, transform: start }, { opacity: 0, transform: `translateX(${direction * (card.clientWidth + 100)}px) rotate(${direction * 12}deg)` }], { duration: 230, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
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
  return () => { disposed = true; cleanupDrag(); };
}
