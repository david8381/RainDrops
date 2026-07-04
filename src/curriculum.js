// Curriculum "track" registry.
//
// A track is a data-only sequencing/level layer over the shared math skills — it
// says which ops are exposed and, per op, how each level maps to a problem
// universe / difficulty. Each track's data lives in its own module under
// `src/tracks/`; this file just assembles them and resolves ids. game-core and
// player-progress read a track through an optional trailing `track =
// TRACKS.standard` parameter, so this module is pure data (no builder functions,
// no globals) and there is no import cycle with game-core.
import { standard } from "./tracks/standard.js";
import { timesTables } from "./tracks/times-tables.js";

export const TRACKS = {
  standard,
  timesTables,
};

export function getActiveTrack(trackId) {
  return TRACKS[trackId] || TRACKS.standard;
}
