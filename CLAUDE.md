# MBP Scrum City: working notes for Claude

A browser 3D city game: Three.js r186 as a global, native ES modules under `public/js/`, no build step. README.md covers the
architecture and how to add vehicles, NPCs, shops and buildings; read the part you need, not the whole tree.

## Setup
- Run `npm ci` before the first test in a fresh checkout (cloud sessions do it at start through `.claude/settings.json`).
- `npm test` is the Vitest unit suite (seconds). CI runs only this.

## Smoke test routine
`npm run test:smoke` plays the game in headless Chromium on software WebGL, split over two browsers at once (about 5 minutes,
against 8 for one). It must pass locally before a PR is merged, because CI does not run it. Every step starts from a reset player, so a
failing step fails alone. Keep the run count low:
1. Write the change and its unit tests first. Check your own smoke step alone: `npm run test:smoke -- <word from its name>`.
2. Run the full `npm run test:smoke` once, in the background, and do other work (screenshots aside, see below) until it ends.
   Don't block a turn on it and don't poll it with sleep loops.
3. If steps fail, rerun only those with the command the run prints (`SMOKE_ONLY="..." node tests/smoke.mjs`). If they fail
   again, run the same command on main (a worktree of origin/main, fetched fresh). Failing on main too means it isn't this
   PR's: say so in the PR with the step names and move on. Failing only on the branch means it's yours to fix.
4. After merging main back in, rerun the full suite only if the merge touched game code (`public/js`) or the smoke test.
   A conflict in docs or another feature's data file needs the unit tests only.
- Don't run the smoke test and a screenshot script at the same time: they share the CPU and steps time out.
- A new feature gets one smoke step that sets up its own state (position, wanted level, vehicles) instead of relying on the
  step before it. Never skip, disable or loosen a step to get green.

## Screenshots
Use `npm run shots -- <out folder> [options]` (options at the top of `tests/shots.mjs`: place, facing, time of day, camera
side, vehicle to ride, things to spawn, a setup snippet). For staging it can't express, pass `--scene file.mjs` rather than
copying boot code into a new `*-shots.mjs`. Look at a picture once it's the one going in the PR; don't read every attempt.

## Keeping the conversation small
- Long loops (smoke reruns, screenshot iteration) can go to a short-lived helper agent that reports back only the failing
  step names or the chosen image paths.
- Read files with a line range or grep for the function you need; most files here are long single modules.

## Merging
- When the request says "merge when green", merge once CI and the smoke routine above pass, without waiting for another
  message. Otherwise ask, and merge on "merge pr".
- Hot files that many threads edit at once: `public/js/core/state.js`, `public/js/ui/hud.js`, `public/js/game/wanted.js`,
  `public/js/combat/combat.js`, `public/index.html`, `tests/smoke.mjs`. Keep edits there small and merge main in before the
  final smoke run, not after it.
- The live site caches JS for up to 4 hours: tell the user a hard refresh may be needed after a merge.
