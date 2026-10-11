# GTA city services: integration handoff

Checkout: `/Users/bryan/Documents/Questoins/mbp-scrum-city-gta-features`
Branch: `feat/gta-city-services`
Committed starting point: `03d86b0237045b3b5381ff91abd9f8a07fe9ed4b` (v1.117).

This is a local shared clone, with Git objects borrowed from the original checkout. Keep the original repository's object store available; do not delete or prune its required objects before integrating. `node_modules` reuses `/tmp/neonbay-pokemon-tools/node_modules`. No upstream push, deployment or merge is part of this work.

## Selected gaps

The committed game already has vehicle theft, traffic, five (and secret six) star escalation, drive-by weapons, aircraft, roof traversal, gun shops, a repair tool, a club, a map and multiplayer. Duplicating these would add little. The strongest bounded gaps were noncombat driving income and a classic paid repair/respray escape service. Taxi passenger AI, property ownership and story missions are deferred because they would substantially widen this change.

Neon Express adds repeatable three-stop courier jobs, ordered stops, deadlines, cash rewards, damage and speed bonuses, a dedicated objective marker and status panel. Spray & Go adds a paid civilian-car repair/respray with pursuit, vehicle, affordability and cooldown gates. Both use existing lots, interaction bindings and entity radar/map hooks, and preserve the blocky neon city.

## Combine after the Pokémon work is safely committed

The original checkout and its uncommitted Pokémon work must remain untouched until its owner is ready. From that checkout, after committing Pokémon work and checking `git status` is clean:

```sh
git fetch /Users/bryan/Documents/Questoins/mbp-scrum-city-gta-features feat/gta-city-services
git cherry-pick FETCH_HEAD
```

Review any conflicts rather than choosing one whole file. Both features add initialization to `public/js/main.js`: retain Pokémon imports/spawning/update hooks, and retain `spawnCityServices()` after `buildWorld()` and `updateCityServicesHUD()` alongside HUD/radar updates. Other GTA edits are the mounted `inVehicle` interaction opt-in, map labels/legend and respray geometry disposal. README changes are additive. This branch does not change inventory, save schema, Pokémon systems or core input bindings.

New modules: `data/city-services.js`, `game/city-services.js`, `world/city-services.js`. New tests: `tests/unit/city-services.test.js`, `tests/city-services-smoke.mjs`.

## Validation and integration checks

Run `npm test` and `node tests/city-services-smoke.mjs`. Do not run software-WebGL smoke/screenshot suites concurrently with another chat. The bounded smoke uses the real F/E/M keyboard interactions, verifies courier completion and payout, and checks garage refusal, repair, heat clearing, payment, cooldown, driving out of the bay and exit. It places the player at destinations rather than testing road navigation AI. A full smoke run remains required by the repository before any eventual merge; after integration, run the combined suite including Pokémon checks.

Manual tour: open the map and find gold D/cyan G; take an ordinary car to D, start a run, follow its separate gold objective marker, stop at the three rings, then drive into G. Check that manual waypoints and Pokémon encounters still work and that Pokémon Center placement avoids both service lots.


Validation at handoff: `npm test` passed all 496 tests across 59 files. The bounded browser check passed with no page/console errors; screenshots of the courier HUD and garage were visually inspected. The full legacy smoke suite was not repeated in this clone to avoid competing with the Pokémon run; run the complete combined suite before any eventual merge.

## Club and car follow-up

`feat/club-and-cars` builds on the GTA services commit. It adds physical stage tipping with bills, performer acknowledgements and crowd/light reactions; a paid DJ request booth with three working music grooves; and four traffic/parked models (Comet Turbo, Stallion V8, Palm Estate, Neon Cab) with distinct geometry and handling. It preserves the existing private room, bar, door, combat restrictions and key bindings.

After integrating the GTA services commit, fetch `feat/club-and-cars` from this clone or GitHub and cherry-pick its follow-up commit. Retain Pokémon initialization when reconciling the small `main.js` parking-model change. This follow-up does not edit Pokémon code or the original checkout. Validation: 512 unit tests, plus `node tests/club-cars-smoke.mjs` for physical interactions and all four new cars. The full combined smoke remains an integration check before merge.


## Random world events

The random-event follow-up adds a session-only director in `game/world-events.js`, procedural meshes in `world/event-models.js`, recoverable ordinary-building damage in `world/event-destruction.js`, and synthesized spatial effects in `core/audio.js` with profiles in `data/world-event-sounds.js`. Every event now has an independent countdown and can overlap other types. Severe and catastrophic events retain a 120–240 second cooldown per type; mild events use 35–70 seconds and moderate events use 70–120 seconds. Initial clocks are staggered. Duplicate instances of the same type are prevented. Menus, interiors and stairs suspend it; death removes it immediately. Abduction releases back into the existing falling/parachute physics. UFO and Godzilla accept shots and rockets; environmental damage does not count as the player's crime.

The original six events are abduction, Godzilla (including charged atomic breath), tsunami, volcano, meteors and tornado. Seven additions are cash rain, fireworks, steam mains, thunderstorms, megaquakes, alien invasions and orbital strikes. Collapsed ordinary buildings use matching reduced mesh/collision/roof heights and restore their exact vertices only after 75 seconds, with the player well away and the footprint unoccupied. Buildings with accessible roof doors, shops and landmarks are protected. The static world map remains a navigation map of the original city.

Run `npm test` for automated checks. The user explicitly requested skipping further browser testing and pushing directly to main for deployed playtesting. The optional `node tests/world-events-smoke.mjs` remains available for later use, but a complete browser pass is not claimed for this integration. On a `?debug` session, `__neonbay.startWorldEvent('godzilla')` (or `ufo`, `tsunami`, `volcano`, `meteors`, `tornado`) starts an event immediately; `__neonbay.stopWorldEvent()` cancels it safely. Keep the Pokémon hooks and new event hooks together when merging `main.js`, and keep both Pokémon sound methods and disaster sounds in `core/audio.js`.


## Independent event intensity follow-up

`data/world-events.js` defines severity, first-arrival staggering and per-event cooldowns. `worldEvents.active` is now a Map keyed by event id; `worldEvents.timers` contains independent inactive countdowns. Starting, ending or shooting down one event never resets another timer or cancels another event. `stopWorldEvent(id)` cancels one, and `stopWorldEvent()` cancels all (including on death). The spatial mixer accepts all active event sources together and keeps the eight loudest voices; quiet celebrations use softer profiles than destructive events.

New gameplay includes capped cash rewards with stale-prompt checks, harmless fireworks, warned steam jets, three-second marked lightning strikes, six quake faults across multiple blocks, five independent invasion beams and a shootable mothership, and three warned 60-metre orbital blasts. Destructive attacks use environmental damage without player crime credit. Every temporary mesh belongs to its event or a strike that is disposed after impact. The existing building restoration/protected-site rules remain in force. Automated regressions cover overlaps, independent cooldowns, scoped cancellation, mixed audio sources, rewards, warnings, beam endpoints, quake coverage and cleanup. Browser validation remains explicitly deferred to deployed playtesting at the user's request.
