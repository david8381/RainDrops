# Feature: Delete player

Status: agreed — ready for implementation
Owner: Codex (planned by Claude; Claude to review)
Last Updated: 2026-07-01
Related Commits: (pending)

## User Request
The player manager can create / switch / clear but not **delete** a player. Add a delete
control (makes testing much easier — create throwaway players and remove them — and is a
real gap for families). Pairs with the new backup/restore (back up → delete → restore).

## Goal
Delete any local player and their progress from the Login popup, safely (confirm; never
leave the store empty; never strand the app with no active player).

## Design
- **Per-row delete** in the Login popup's profile list: a small delete control (trash/×) on
  each profile row, so you can remove any player (best for clearing out test profiles).
- **Confirm** before deleting (destructive, irreversible) — reuse the `window.confirm`
  pattern the restore flow uses: *"Delete [name] and all their progress? This can't be
  undone."* Mention backup in the copy is optional.
- **Edge cases (handle in `player-progress`):**
  - Deleting a **non-active** player → just remove it; active player unchanged.
  - Deleting the **active** player → switch to another existing player (e.g. the most
    recently updated) and activate it.
  - Deleting the **last** player → reset to a fresh default player (like a first visit), so
    the store is never empty and there's always an active profile.
- After a delete, refresh the manager list + the header/welcome current-player line
  (`onProfileChanged`), same as switch/create/clear/restore.

## Open Questions
- **Settled:** per-row delete, confirm required, active/last-player edge cases as above.
- Icon vs text for the per-row control — impl call; keep it clearly a delete affordance and
  not easily mis-tapped next to the switch action.

## Implementation Notes
- **`player-progress.js`:** add `deleteStoredProfile(userId, storage, nowMs)` —
  `readProfileStore` → `delete store.profiles[userId]` → if it was `activeUserId`, pick a
  remaining profile (most-recent `user.updatedAt`) as active, or if none remain create a
  fresh default (reuse the default-profile/first-visit path) → `writeProfileStore` → return
  the active profile (like `switchStoredProfile`/`importStoredProfile` do). Export it.
- **`src/popups/login-popup.js`:** add the per-row delete control in the profile list build;
  on click → confirm → `ctx.deleteProfile(id)` → `activateProfile(result)` →
  `closeLoginPopup()` + `onProfileChanged?.()`. Add `deleteProfile` to the ctx (wired in
  `script.js`'s `openLoginPopup` to `deleteStoredProfile`). Don't let the delete control's
  click also trigger the row's switch handler (stop propagation).
- **Tutorial copy (`src/text/english.js`):** step 8 (Profiles) — add "delete" to the Login
  verbs ("switch, create, clear, delete, back up, or restore"), and the welcome
  `playerSubtitle` similarly.
- **Test hook (`script.js`):** expose `deletePlayer(userId)` on `window.__RAIN_MATH_TEST__`
  (or reuse an existing profile-list hook) for e2e.

## Acceptance Criteria
- Each profile row in the Login popup has a delete control that removes that player after a
  confirm.
- Deleting a non-active player leaves the active player unchanged; deleting the active player
  switches to another; deleting the last player resets to a fresh default (store never empty,
  always an active profile).
- The manager list and current-player display update after a delete.
- Backup → delete → restore round-trips (restore re-adds the deleted player).

## Testing
- **Unit (player-progress):** `deleteStoredProfile` — removes a non-active profile (active
  unchanged); removing the active one re-points `activeUserId` to a remaining profile;
  removing the last one yields a fresh default profile; store never ends empty.
- **E2E:** create two players, delete one from the list → it's gone and the right player is
  active; delete down to none → a default player exists; (optional) back up a player, delete
  it, restore the code → it returns.

## Outcome
(pending implementation by Codex)
