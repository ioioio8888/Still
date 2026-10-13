# 暫放

A quiet multilingual writing space with an anonymous community wall. Node.js 22.13+ is required; no third-party dependencies or build step.

## Run

```sh
npm start
```

Open http://localhost:3000. Run `npm test` for the isolated API integration test and `npm run check` for syntax validation.

## Features

- Free writing with preview before publishing; optional mood tags.
- Anonymous public wall with filters and pagination.
- “我聽到了” / “I hear you” as the only support reaction, with duplicate prevention and no public counts.
- Colloquial Traditional Chinese, written Traditional Chinese and English UI, remembered per browser. Language changes preserve drafts and visibility; message bodies are never machine translated.
- WebGL2 fluid ink canvas: velocity advection, vorticity, pressure projection, dye mixing, pointer stirring, keyboard drops and washing. Pauses offscreen; resources are released when navigating away. Reduced-motion defaults to no ambient animation; the visitor can explicitly enable it. Unsupported GPUs show a static fallback.
- My corner, owner-only deletion, private browser-local notes.
- Reports: three distinct anonymous visitors hide a post from public listings.
- Responsive layout, keyboard focus, reduced-motion support, accessible dialog.
- Empty wall shows clearly labeled illustrative examples, never fabricated activity.

## Storage and anonymity

Public records use SQLite in `data/letters.sqlite`; preserve this directory across restarts. The server stores a hash of a random HttpOnly, SameSite=Strict cookie as the owner identity, not names or accounts. Clearing the cookie loses ownership access. Private notes use localStorage only and are accessible to anyone using that browser profile. They are not encrypted or backed up and are lost when browser storage is cleared. Drafts remain in memory during navigation and warn before closing an unfinished page.

## Hosting

This version runs locally and has not been deployed. It needs a Node server with a persistent disk, not static-only hosting. Configuration: `HOST` (default 127.0.0.1), `PORT` (3000), `DB_PATH`, `PUBLIC_ORIGIN` (exact HTTPS origin), `COOKIE_SECURE=1` when using HTTPS. Configure TLS through the hosting provider/reverse proxy. SQLite is experimental in Node 22 and emits a startup warning.

Automatic moderation has no manual review queue. Anonymous cookies do not prove unique people; clearing cookies can bypass reaction/report deduplication. Report hiding is a basic threshold, not human moderation. The write rate limit uses socket IP; behind a proxy it is shared unless an explicitly trusted proxy scheme is implemented. No treatment outcomes are claimed; this is a space for writing and support.

## Validation

The integration test uses a temporary database and checks validation, cross-origin rejection, separate ownership, duplicate support, report hiding, pagination, filtering, durable persistence after restart and owner-only deletion. It does not add test posts to the local preview database.

## Automatic public-content policy

`moderation-policy.json` contains the editable Chinese and English political and abusive terms, link restriction and repeated-character limit. Restart the server after editing it. NFKC normalization, zero-width removal and punctuation/spacing tolerance handle some common disguises. Political matches, direct abusive phrases, links and excessive repetition are rejected before saving; the localized UI keeps the draft. Accepted notes publish immediately. Private browser-local notes are not uploaded or filtered.

This is a deterministic keyword filter, not semantic moderation: implicit political references, new terms, names or creative evasion can slip through, and quoted terms can produce false positives. It does not guarantee exclusion of all political or malicious material. Existing notes are not retroactively deleted. No AI service or external moderation provider receives notes.

The test suite also covers translation-key parity, English UI coverage, political and abusive obfuscation and normal-message false-positive checks. The GPU shaders, ink controls, language switching, preserved draft and rejected-publication flow were checked in the local browser.
