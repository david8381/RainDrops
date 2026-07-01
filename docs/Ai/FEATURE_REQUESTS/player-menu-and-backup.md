# Feature: Consolidate the player menu + profile backup/restore

Status: agreed — ready for implementation
Owner: Codex (planned by Claude; Claude to review)
Last Updated: 2026-07-01
Related Commits: (pending)

## User Request
Two problems, one place:
1. **Redundant menus.** The Login popup (click username) and the Welcome "Menu" both let you
   switch/create players; "Clear stats" is only in Login. Consolidate — make the Login popup
   the one full player menu (incl. Clear), and stop the Welcome menu from duplicating it.
2. **Backup/restore.** Save the current player's progress as a compressed, checksummed
   (anti-tamper) blob and restore it later — living in the (now single) player menu.

## Goal
One surface owns player management; the home screen owns *starting to play*. Plus a
portable backup so localStorage-only progress can survive a cleared browser or move devices.

## Design

### Part 1 — one player manager (keep the "Login" label)
- **Login popup = the single player manager.** Keeps its current switch / create / **Clear
  stats** / close, and gains the **Backup / Restore** section (Part 2). Label stays "Login"
  (David's call).
- **Welcome menu = game entry only.** Remove its embedded profile **list** (`welcome-profile-list`)
  and **create form** (`welcome-create`). Keep Play / Tutorial / Test Me / Support, show the
  current player as a line, and turn the existing `welcome-login` button into a single
  **"Switch / manage players"** button that opens the Login popup. First-visit create still
  happens in one click via that button.
- Net: switch + create live in exactly one place; Clear is discoverable; each menu has one job.

### Part 2 — profile backup / restore
Reuse the share-link machinery — this is mostly plumbing, not new crypto/compression.
- **What:** the **active player's** full profile (skills, levels, session log, settings). A
  "back up all players" variant is out of scope for now.
- **Encode:** a backup payload `{ v: <backupSchemaVersion>, app: PROFILE_VERSION, kind: "backup",
  profile }` → JSON → `deflateRawToB64url` (generic; already exists) → scheme-tagged string,
  with a disguised tamper checksum via `computeShareChecksum(content, SHARE_SALT)` stored as
  `id` (same pattern as the report share). Use a **distinct marker/prefix** (or the
  `kind:"backup"` field) so a backup blob is never confused with a `#report=` blob.
- **Deliver both** (David: "include a copy str"): a **Download** button (file
  `rainmath-<name>-backup.txt` containing the blob) **and** a read-only field + **Copy**
  button.
- **Restore:** paste the code *or* pick a file → decode → `verifyShareChecksum` (fail →
  "This backup looks damaged" toast, no import) → **confirm**:
  - if a profile with the backup's id/name already exists → *"Restore will replace [name]'s
    progress — continue?"* then overwrite;
  - else add it as a new player.
  Then activate it (`activateProfile`).
- **Schema/version:** the blob carries `PROFILE_VERSION`. On import, run the profile through
  the **existing migration/normalize path** (the one `readProfile` uses at
  player-progress.js ~653/682) so an older backup upgrades cleanly. If the blob's version is
  *newer* than this app supports, refuse gracefully ("This backup is from a newer version").

## Open Questions
- **Settled:** one manager (Login popup), keep "Login" label, welcome menu just links to it;
  backup = active player only; deliver **file + copy string**; restore = add-as-new, overwrite
  only on name/id match with confirmation; carry + migrate the schema version.
- Exact backup file extension/name and the tamper-marker string — impl detail, keep it clear.

## Implementation Notes
- **Codec/backup (game-core or a small helper module, pure + unit-tested where possible):**
  reuse `deflateRawToB64url`/`inflateRawFromB64url` (script.js, generic) + `computeShareChecksum`
  /`verifyShareChecksum` (game-core) + `SHARE_SALT`. Extend the checksum content function
  (`shareContentString`) with a `kind:"backup"` branch, or add a dedicated
  `backupContentString`, so the checksum covers the backup payload deterministically.
- **Store import (player-progress.js):** add an `importStoredProfile(profileObj, storage, nowMs)`
  that reads the store (`readProfileStore`), normalizes/migrates the incoming profile through
  the same path as `readProfile`, upserts it under its `user.id` (handling id/name collision),
  sets it active, and writes back (`writeProfileStore`, the `setItem` at ~774). Return the
  activated profile so `script.js` can `activateProfile` it. Exists already: `readProfileStore`,
  `writeProfileStore`, `createStoredProfile`, `switchStoredProfile`, `resetStoredProfile`,
  `PROFILE_VERSION`.
- **Login popup (`src/popups/login-popup.js`):** add a "Backup / Restore" section above the
  actions row. Backup produces the blob (async: `encodeSharePayload`-style) and offers
  Download + Copy (`copyTextToClipboard` already injected/available). Restore has a paste field
  + file `<input type=file>`; on submit, decode/verify/confirm/import via the injected ctx
  (add the new ctx deps: an async encode, a decode+verify, and `importStoredProfile`→`activateProfile`).
- **Welcome menu (`buildWelcomeMenu`, script.js ~5090):** delete the list/create-form build,
  repoint `welcome-login` to "Switch / manage players" → `openLoginPopup()`.
- **Test hooks:** expose `getBackupCode()` / `restoreBackup(code)` (and a tampered variant) on
  `window.__RAIN_MATH_TEST__`, mirroring the existing `getShareReportCode`/`getTamperedReportCode`.

## Acceptance Criteria
- Profile **switch** and **create** exist in exactly one place (Login popup); the Welcome menu
  no longer has a profile list or create form, just a button that opens it. **Clear** is in the
  Login popup.
- **Back up** the active player → produces a downloadable file *and* a copyable code.
- **Restore** a valid backup → decodes, verifies, confirms, imports, and activates it; a
  round-trip (backup → clear/switch → restore) reproduces the player's progress.
- A **tampered/corrupt** backup is rejected with a toast and imports nothing.
- Restoring a name that already exists prompts before replacing; a new name is added as a new
  player. An older-schema backup migrates; a newer-schema one is refused gracefully.

## Testing
- **Unit (player-progress / codec):** `importStoredProfile` upsert + collision + migration of an
  older-version profile; backup checksum verify passes intact / fails on edit; profile
  round-trips through encode→decode unchanged.
- **E2E:** back up a player with some progress (test hook), Clear stats, restore the code →
  progress returns and the player is active; a tampered code is rejected (no import); the
  Welcome menu shows no profile list/create form and its button opens the Login popup which has
  switch/create/clear/backup/restore.

## Outcome
(pending implementation by Codex)
