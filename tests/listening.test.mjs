import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listeningRank, excludedIds, RECENCY_WINDOW } from '../lib/listening.mjs';

test('listening selection favors recent notes while still selecting old notes', () => {
  let seed = 781;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const now = 1800000000000;
  let recent = 0;
  for (let i = 0; i < 10000; i++) {
    if (listeningRank(now, now, random) < listeningRank(now - 30 * RECENCY_WINDOW, now, random)) recent++;
  }
  assert.ok(recent > 8000 && recent < 8700, `recent selected ${recent} times`);
  assert.ok(Number.isFinite(listeningRank(now, now, () => 0)));
  assert.equal(listeningRank(now + 1000, now, () => .5), listeningRank(now, now, () => .5));
});

test('listening exclusions accept only bounded unique note IDs', () => {
  const ids = Array.from({ length: 130 }, (_, i) => i.toString(16).padStart(32, '0'));
  assert.deepEqual(excludedIds(ids.join(',')), ids.slice(-120));
  assert.deepEqual(excludedIds(`${ids[0]},${ids[0]},' OR 1=1 --`), [ids[0]]);
});
