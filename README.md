# 暫放

A quiet multilingual writing space with an anonymous community wall. Node.js 22 is required. Local preview uses SQLite; Vercel uses Neon PostgreSQL through the official serverless driver.

## Run

```sh
npm ci
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

### Vercel + Neon (free plans within their limits)

1. In Vercel, import `ioioio8888/Still`, branch `main`, framework preset **Other**, root directory `./`. `vercel.json` sets the install command (`npm ci`), build command (`npm run build`), static output (`public`) and API routes.
2. Create a **Free** Neon database through Vercel Storage / Marketplace, or create it in Neon and add its connection string as `DATABASE_URL` in Vercel. Keep it server-only; never use a `PUBLIC_` prefix or put the URL in source control. Use the database only through this backend; no browser database access is required.
3. Supply `DATABASE_URL` to the Production environment before deploying. If the first import builds before the database is connected, that build deliberately fails; connect Neon and redeploy. Use a separate Neon branch/database for Preview to avoid preview writes to live notes.
4. Deploy/redeploy. The build syntax-checks the app and applies the idempotent `db/schema.sql` in a transaction; existing notes are preserved. There is no local SQLite database in the cloud deployment.
5. Open the deployment URL. Test a note, another browser's support reaction, and owner-only deletion. Redeploy and verify a retained note still appears.

Vercel sets secure cookies automatically. `PUBLIC_ORIGIN` is optional: by default each deployment accepts its own HTTPS origin. If set, use the exact canonical HTTPS origin without a trailing slash. Never set `HOST`, `PORT` or `DB_PATH` for this Vercel deployment.

The cloud API shares a 20-post rolling-hour allowance per IP in PostgreSQL, atomically across function instances. It trusts only Vercel's overwritten `x-vercel-forwarded-for` header in Vercel mode. IPs are stored as keyed hashes, using `RATE_LIMIT_SECRET` if supplied or the database connection string as the key; expired counters are removed on subsequent valid post attempts. Setting a new key resets effective allowances. Reaction and report counts are deduplicated by anonymous identity; reports are serialized per letter before evaluating the hide threshold. Deleting a note cascades to its reactions and reports.

Vercel Hobby is for personal, non-commercial use. Check the current Vercel and Neon free limits before launch. No paid resources are created by these files. GitHub upload alone does not create a deployment or database, and local notes are not automatically uploaded.

### Local / persistent Node hosting

`npm start` retains the original SQLite preview and requires no database credentials. It needs a persistent disk for public hosting. Configuration: `HOST` (default 127.0.0.1), `PORT` (3000), `DB_PATH`, `PUBLIC_ORIGIN` (exact HTTPS origin), `COOKIE_SECURE=1` when using HTTPS. Configure TLS through the hosting provider/reverse proxy. SQLite is experimental in Node 22 and emits a startup warning.

Automatic moderation has no manual review queue. Anonymous cookies do not prove unique people; clearing cookies can bypass reaction/report deduplication. Report hiding is a basic threshold, not human moderation. The local SQLite server's write rate limit uses socket IP and memory; behind a proxy it is shared. The Vercel backend uses the persistent allowance described above. No treatment outcomes are claimed; this is a space for writing and support.

## Validation

The integration test uses a temporary database and checks validation, cross-origin rejection, separate ownership, duplicate support, report hiding, pagination, filtering, durable persistence after restart and owner-only deletion. It does not add test posts to the local preview database.

`tests/postgres.test.mjs` runs the cloud SQL and handler against a real embedded PostgreSQL engine (PGlite): Vercel-parsed bodies, secure cookies, cache headers, shared limits across fresh handlers, concurrent write attempts, idempotent schema setup, reports, deletion cascades, moderation and pagination. This checks PostgreSQL semantics locally; it does not substitute for a live Neon/Vercel smoke test after accounts are connected.

## Automatic public-content policy

`moderation-policy.json` contains the editable Chinese and English political and abusive terms, link restriction and repeated-character limit. Restart the server after editing it. NFKC normalization, zero-width removal and punctuation/spacing tolerance handle some common disguises. Political matches, direct abusive phrases, links and excessive repetition are rejected before saving; the localized UI keeps the draft. Accepted notes publish immediately. Private browser-local notes are not uploaded or filtered.

This is a deterministic keyword filter, not semantic moderation: implicit political references, new terms, names or creative evasion can slip through, and quoted terms can produce false positives. It does not guarantee exclusion of all political or malicious material. Existing notes are not retroactively deleted. No AI service or external moderation provider receives notes.

The test suite also covers translation-key parity, English UI coverage, political and abusive obfuscation and normal-message false-positive checks. The GPU shaders, ink controls, language switching, preserved draft and rejected-publication flow were checked in the local browser.
