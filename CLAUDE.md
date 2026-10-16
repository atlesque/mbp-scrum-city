# MBP Scrum City: working notes for Claude

A browser 3D city game: Three.js r186 as a global, native ES modules under `public/js/`, no build step. README.md covers the
architecture and how to add vehicles, NPCs, shops and buildings; read the part you need, not the whole tree.

## Setup
- Run `npm ci` before the first test in a fresh checkout (cloud sessions do it at start through `.claude/settings.json`).
- `npm test` is the Vitest unit suite (20 s). CI runs it and the smoke test on every PR and every push to main.

## Smoke test routine
`npm run test:smoke` plays the game in headless Chromium on software WebGL, split over two browsers at once (about 4 minutes
locally). Under `?debug` the world keeps real time however slowly frames are drawn (see `frame()` in `public/js/main.js`), so
a step should wait on game state (`until(...)`, `G.time`), not on a fixed sleep. CI runs the full suite on every PR, so:
1. Write the change and its unit tests first. Check your own smoke step alone: `npm run test:smoke -- <word from its name>`.
2. Push and let CI run the full suite; don't run it locally as well. Wait for the CI event rather than polling.
3. The runner already reruns failed steps once on their own and lists the ones that passed then as flaky (they don't
   fail the run; fix one if it keeps showing up). If CI's smoke job still fails, rerun those steps locally with the command its log prints
   (`SMOKE_ONLY="..." node tests/smoke.mjs`). If they fail again, run the same command on main (a worktree of origin/main,
   fetched fresh). Failing on main too means it isn't this PR's: say so in the PR with the step names and move on. Failing
   only on the branch means it's yours to fix.
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
- When the request says "merge when green", merge once CI (unit tests and smoke) passes, without waiting for another
  message. Otherwise ask, and merge on "merge pr".
- Hot files that many threads edit at once: `public/js/core/state.js`, `public/js/ui/hud.js`, `public/js/game/wanted.js`,
  `public/js/combat/combat.js`, `public/index.html`, `tests/smoke.mjs`. Keep edits there small and merge main in before the
  last CI run, not after it.
- The live site caches JS for up to 4 hours: tell the user a hard refresh may be needed after a merge.
