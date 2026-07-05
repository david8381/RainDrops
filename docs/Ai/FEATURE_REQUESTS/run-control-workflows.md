# Feature: Run Control Workflows

Status: landed
Owner: Codex
Last Updated: 2026-07-05
Related Commits: pending

## User Request
Review the Start/Resume/Pause, Restart, and Finish workflows across no selected
problem types, selected practice, boss/challenge play, and other modes. In
particular, Start and Restart should not imply useful action when no problem type
is selected.

## Goal
Make the run controls mean one thing in each state, with no empty live run and no
empty report. A child should know whether they need to pick a type, press Start,
pause/resume, restart a real run, quit a challenge, or finish a reportable sitting.

## Design
- Start is disabled until at least one problem type is selected and Drops is above
  0. The Start pulse appears only in that playable ready state.
- Restart is disabled at the empty ready gate, but enabled when there is a run,
  challenge, Test Me, breather, board/input state, or cleared score to abandon.
- Finish is disabled until the active session has reportable activity: ordinary
  practice, assessment results, or a started/completed challenge.
- Boss, Blitz, Wave, and Worksheet starts force the run live immediately, even if
  they are launched from the ready gate.
- Pause/Resume remains available during ordinary practice, boss/challenge, and
  Test Me; config controls stay locked during boss/Test Me.

## Implementation Notes
- `src/game-core.js` owns the pure `deriveRunControlState` helper.
- `src/player-progress.js` owns `hasSessionReportableActivity`.
- `script.js` renders desktop and touch controls from those helpers and keeps
  Restart/Finish/Start guards in the action functions.

## Acceptance Criteria
- No selected type: Start, Restart, and Finish are disabled; the hint asks the
  player to select a problem type.
- Selected type with Drops 0: Start is disabled and the hint asks the player to
  raise Drops.
- Selected type with Drops above 0: Start is enabled and pulsing; pressing it
  begins practice.
- Restart from practice, boss/challenge, or Test Me clears transient state and
  returns to the ready gate without stale locked controls.
- Finish after activity opens the current session report; later practice remains
  in the same session after selecting a type and pressing Start.
- Boss/challenge actions from the ready gate begin immediately and show Pause,
  not a second Start step.

## Testing
- Unit coverage for run-control derivation and reportable-session detection.
- E2E coverage for real welcome ready state, empty Start gating, Drops 0 gating,
  challenge-from-ready, Test Me control cleanup, Restart cleanup, and Finish
  continuation.

## Outcome
Implemented locally. The app now prevents empty run/report actions and keeps the
run-control labels, disabled states, and hints synchronized across desktop and
touch control paths.
