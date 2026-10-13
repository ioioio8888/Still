export const RECENCY_WINDOW = 7 * 24 * 60 * 60 * 1000;
export function excludedIds(value = '') {
  return [...new Set(value.split(',').filter(id => /^[a-f0-9]{32}$/.test(id)))].slice(-120);
}
// Exponential race: recent notes have up to five times an old note's weight.
// The floor preserves a chance for every public note, regardless of age.
export function listeningRank(created, now = Date.now(), random = Math.random) {
  const weight = .2 + .8 * Math.exp(-Math.max(0, now - Number(created)) / RECENCY_WINDOW);
  return -Math.log(Math.max(.000001, random())) / weight;
}
