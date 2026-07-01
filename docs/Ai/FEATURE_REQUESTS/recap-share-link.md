# Feature: Shareable recap link (achievement card)

Status: landed
Owner: Codex (planned by Claude; reviewed by Claude)
Last Updated: 2026-07-01
Related Commits: (this commit)

## User Request
The Recap (boss-victory "badge" popup, also reachable per-level via the badge button)
currently **shares plain text** + a bare `rainmath.com` link — so the recipient never sees
the achievement, they just get pasted text. Make the recap a **reconstructable, checksummed
link that opens into a read-only achievement card** ("Ada cleared Addition Level 3!"),
reusing the report/backup share machinery. A punchy single-achievement brag card, distinct
from the fuller session report.

## Goal
A `#recap=` link that opens, read-only, into the same polished recap card the player sees —
tamper-protected, tiny — while keeping the plain-text summary for previewless contexts.

## Design
Reuse the existing share codec + read-only open flow; this is another `kind`, not new infra.

### Payload (`kind:"recap"`) — a view model, not pre-formatted text
Store *values*, reformat on render (like the report view model), so the card is consistent:
`{ v:1, kind:"recap", name, opKey, level, blitz:<best|null>, wave:<best|null>,
worksheet:<best|null>, bossCleared:boolean, at:<ISO date> }`, then `id = makeShareId(content)`
(the disguised tamper checksum). Source the bests exactly as `getShareBadgeData` does
(`getBlitzBest` / `getChallengeBest(...,"wave") / (...,"boss")`). Tiny → an even shorter link
than the report.

### Link + open flow
- Share link `#recap=<encodeSharePayload(payload)>` (clickable), alongside the plain text.
- `openSharedReportFromCode`'s cold-load (script.js ~7306) + `hashchange` (~4793) handlers
  also match `#recap=(.+)`; decode via `decodeShareReportCode`, then **route by kind**: a
  `kind:"recap"` payload → `openSharedRecapView(payload)`; existing report payloads unchanged.
- **Read-only recap view:** render the recap card from the decoded model with a "Shared
  recap" banner + **Exit** (no Copy/Share buttons), mirroring the shared-report read-only
  pattern. Set a `state.recapViewData` (or reuse the shared-view gating) so it's clearly a
  read-only shared view; Exit clears it + the hash like `exitSharedReportView`.

### Card rendering (share once)
Extract a `buildRecapCard(data)` helper from the current `showShareBadge` DOM assembly
(art + title + player name + Blitz/Wave/Worksheet rows), used by **both** the live recap
popup and the shared read-only view — so they can't drift.

### Sharing UX (keep the text)
In the recap popup, alongside the existing Copy/Share, generate the `#recap=` link and make
the share-sheet payload `"<name> cleared <opName> Level <level>! <recapLink>"` (+ the stat
lines). So it reads fine in SMS with no preview *and* the link now shows the card. Shareable
**anytime** from the per-level badge button, not only at the victory moment.

### Checksum
Add a `kind:"recap"` branch to `shareContentString` (game-core) so the checksum covers the
recap content deterministically (same pattern as the `backup` and `v2` branches). Verify on
open; a tampered/edited recap is rejected (stops faking a better score) with a broken-link
toast.

## Open Questions
- **Settled:** card = op + level + 3 bests + boss-cleared + date; `#recap=` clickable link +
  keep text; shareable anytime from the badge button; tamper-checksummed.
- Exact brag-line copy and whether to show the date on the card — impl call, keep it tight.

## Implementation Notes
- **game-core:** `shareContentString` gets a `kind:"recap"` branch (`{v,kind,name,opKey,level,
  blitz,wave,worksheet,bossCleared,at}` in a fixed order).
- **script.js:** `buildRecapPayload(opKey, level)` (uses `getShareBadgeData` values + bests);
  `getRecapShareCode`/`getRecapShareLink` (mirror `getShareReportCode`/`getSharedReportLink`);
  `decode`→route in `openSharedReportFromCode`; `openSharedRecapView` + `exitSharedRecapView`;
  `buildRecapCard(data)` extracted from `showShareBadge` and reused. The recap popup wires the
  link into its share/copy text.
- **Read-only gating:** ensure a shared recap view can't mutate profile state (it's just a
  card; no editing surface exists, but keep the same "shared view" discipline and Exit).
- **Test hooks:** `getRecapCode(opKey, level)` + `getTamperedRecapCode` on
  `window.__RAIN_MATH_TEST__`, mirroring the report hooks.
- No profile schema change.

## Acceptance Criteria
- The recap popup produces a `#recap=` link (plus the plain text); opening that link lands on
  a read-only recap card (banner + Exit), reproducing the sender's op/level/bests.
- A tampered/corrupt recap link is rejected with a toast, shows nothing.
- The live recap popup and the shared card render identically (shared `buildRecapCard`).
- Report links (`#report=`) still open as before (routing by kind doesn't regress them).
- Recap is shareable from the per-level badge button, not only at boss victory.

## Testing
- **Unit (game-core):** recap `shareContentString` branch is stable/ordered; checksum passes
  intact and fails on an edited field.
- **E2E:** generate a recap code (test hook) with some challenge bests → open `/?test=1#recap=…`
  in a fresh page → the read-only recap card shows the op/level/bests with a "Shared recap"
  banner and Exit, no Copy/Share; a tampered code is rejected; a normal `#report=` link still
  opens the report (no regression).

## Outcome
Implemented in the working tree:
- Added a `kind:"recap"` checksum branch in `game-core` so recap payloads are
  tamper-evident over `{v, kind, name, opKey, level, blitz, wave, worksheet,
  bossCleared, at}`.
- Added live recap payload/link helpers in `script.js`; Copy/Share text now
  includes a generated `#recap=` link while keeping the readable plain-text
  summary.
- Extracted `buildRecapCard(data)` and reused it for both the normal Recap popup
  and the shared read-only recap overlay.
- Added `#recap=` cold-load and hashchange routing with a "Shared recap
  (read-only)" banner, Exit button, and no Copy/Share controls.
- Added test hooks plus unit/e2e coverage for valid recap links, tampered recap
  rejection, and the live Recap popup exposing the link.
