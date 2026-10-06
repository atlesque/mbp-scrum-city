# MBP - Scrum City

A low-poly 80s beach-city shooter that runs in desktop browsers. Shoot for cash, outrun the wanted level, and spend the money on better guns at Bullet Bros. Guns.

**Live:** https://mbp-scrum-city.atlesque.dev (also https://mbp-scrum-city.pages.dev)

## Gameplay

- Taking people down drops cash and raises your wanted level (1–5 stars).
- Each star brings tougher enemies: police, police cars, SWAT, federal agents with a helicopter, then soldiers and minigun heavies.
- Downed police, SWAT, feds, soldiers and heavies can also drop armor (blue) and ammo (yellow) for every gun you own that uses it. Tougher enemies drop more often; a heavy always drops both.
- Break line of sight with the law and the stars flash and fade one at a time.
- Two gun shops (pink `$` on the radar) sell an SMG, shotgun, assault rifle, minigun and rocket launcher, plus upgrades, ammo, health and armor. They close at 4+ stars.
- Adventure bikes cruise the streets (white dots on the radar): the black BMW R 1300 GS 'Triple Black' and the Yamaha Ténéré 700 Rally in blue rally livery. Shoot or ram the rider off, walk up and press `F` to take the bike. Riderless bikes show as cyan squares. Ride into a car gently (nosing into a parked one, or catching up with one going your way) and the bike climbs up over its bonnet and roof and drops off the far side; hit one hard and you crash into it.
- Every car can be driven: 80s sedans and the white Tesla Model Y. Traffic cars have someone at the wheel. Shoot them through the glass, or walk up to a slow or stopped car and press `F` to drag them out (that's a crime). Parked cars are free to take. Cars crash into each other: drive into one and it skids off, dented and spinning if you hit it off-centre, and can knock into the next one along.
- Eight buildings around the city have a lit **Roof** door at street level (green squares on the radar). Press `E` there to take the stairs up to a fenced rooftop with a view over the city, and `E` at the stair hut's **Exit** door to come back down.
- Dying sends you to City General with a 10% hospital bill. Progress saves in `localStorage`.
- **Settings** (pause menu or title screen): sound on/off, effects and music volume, render quality, draw distance, animated waves, mouse sensitivity, invert look, field of view, camera shake, crowd and traffic density, km/h or mph, and a read-only list of the controls. Settings save in this browser, separately from game progress.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look and aim (click to capture the mouse) |
| Left click / right click | Shoot (or punch and swing a melee weapon; every third punch is a kick) / zoom aim (with the sniper rifle, right click steps the scope through 2.25x, 9x and back out) |
| Shift / Space | Sprint / jump |
| E | Enter a gun shop, take the stairs to a roof and back down |
| F | Get on or off a motorcycle, get in or out of a car, pull a driver out of their car |
| On a bike: W / S, A / D, Shift, Space | Throttle / brake, lean, boost, rear brake. You can still shoot. |
| In a car: W / S, A / D, Shift, Space | Gas / brake, steer, boost, handbrake. Steer with the handbrake to drift; hold the gas to keep the slide going, countersteer to straighten out. |
| 1–7, mouse wheel | Switch weapons |
| Q | Put the guns away: fists, then each melee weapon you own |
| R | Reload |
| M | Toggle the radio (Neon FM builds up with your wanted level: synths only at zero stars, drums from one star, more layers up to five) |
| Esc / P | Pause |

## Project layout

`public/index.html` holds the page, styles and HUD markup, and loads the game as native ES modules from `public/js/` (no build step). Three.js (r186) loads from jsDelivr as an ES module in `js/three.js`, which sets it as the global `THREE`, fonts from Google Fonts, and all sound is synthesized with the Web Audio API.

```
public/js/
  main.js            boot and the frame loop: updates every entity in the registry
  core/              state, input, audio, save (versioned), event bus, helpers
  entities/          the registry every person, vehicle, pickup and shop lives in
  vehicles/          the shared vehicle layer: vehicle.js, kinds/ (bike, car), models/, traffic, helicopter
  npcs/              NPC_TYPES, behaviours (wander, hunt, ride) and the Npc entity
  shops/             SHOP_TYPES, item types and the shop entity and menu
  game/              player, interaction prompts, rewards, wanted level, population, pickups
  world/             city layout, collision, radar, landmarks and .glb models
  render/ ui/ characters/ combat/ data/
```

Everything in the world is an entity in `entities/registry.js`. Entities opt into traits (`update`, `raycast`, `onShot`, `blast`, `pushOut`, `blip`, `interaction`, `shouldDespawn`, `dispose`), so shooting, explosions, collisions, the radar and the E/F prompt work for anything new without touching those systems. Systems talk through `core/events.js` (`npc:killed`, `vehicle:wrecked`, `shop:purchase`, …); `game/rewards.js` turns those into cash, drops and heat.

Alongside the code in `public/`: the favicon set, `site.webmanifest`, the share image `og-image.jpg`, `robots.txt` and `sitemap.xml`.

## Extending the game

**A new vehicle.** Add a file to `public/js/vehicles/models/` whose default export describes it (`id`, `kind`, `name`, `short`, `hp`, `engine`, optional `traffic: { weight, speed }`, `electric: true` for an EV (a hum below 30 km/h, then only road noise, instead of an engine note), and the mesh or geometry its kind expects), then list it in `models/index.js`. `kind: 'bike'` or `'car'` gives it physics, seating, camera and crash rules; a model can override `handling`. A traffic weight above 0 puts it on the roads. A new kind of vehicle (a boat, a truck) is a new file in `vehicles/kinds/` implementing the hooks documented at the top of `kinds/bike.js`.

**A detailed car.** The blue Tesla Model Y, the Mercedes EQA 250 and the BMW 530e are drawn with the car kit in `models/carkit.js`: in real metres, as side outlines (body, glass, roof) pushed across the car's width with rounded edges, plus trims and lamps laid onto the panels, all bent by one warp (narrower nose and tail, sides leaning in towards the roof). Lamps use an unlit material, so they glow at night. Each model builds its geometry once and every car of that model shares it. `models/bmw5.js` is a worked example. Preview a car at `/dev/cars.html?car=<id>` (drag to orbit; `&night`, `&neutral` for plain white light) and render the previews with `node tests/car-shots.mjs`. Keep a car to about 15–18k triangles.

**A new NPC.** Add an entry to `NPC_TYPES` in `npcs/types.js` (faction, behaviour, hp, look, cash, heat, `drops`, and weapon stats if armed). Spawn it with `spawnNpc(id, x, z)`, through a wanted level's `mix` in `data/wanted.js`, or with a row in `POPULATION` in `game/population.js`. New behaviours go in `npcs/behaviours.js`.

**A new melee weapon.** Add a `melee({ ... })` entry to `WEAPONS` in `data/weapons.js` with its damage, `rate` (seconds between swings), `reach`, `arc`, `knock`, `hits` and `anim` (`punch`, `swing`, `chop`, `stab` or `saw`, the moves in `characters/swing.js`); `blade` cuts, `auto` keeps cutting while the button is held. Give it a model in `characters/melee-models.js` (grip at the origin, running down -Y, tipped forward by `tilt`) and an icon in `drawWeaponIcon` (`ui/hud.js`). It shows up in the gun shop on its own; list it in `STREET_MELEE` in `main.js` to lie around the city too. Blows land in `combat/melee.js` and use the same hit zones as bullets; people reel or go down (`meleeHit` in `npcs/npc.js`), and civilians with `fightBack` may punch back (the `brawl` behaviour).

**A new shop.** Add an entry to `SHOP_TYPES` in `shops/types.js` (name, marker, storefront, catalogue) and place it in `SHOP_SITES` in `world/city.js`. New kinds of goods are an entry in `ITEM_TYPES` in `shops/items.js` with `render` and `act`.

**More rooftop doors.** `ROOF_COUNT` in `world/rooftops.js` sets how many buildings get one. They are chosen from the flat-roofed city buildings after the city is built (the first next to the spawn, then each as far from the others as it can be), without the seeded random, so the rest of the layout doesn't move. `makeRoof` lays out the door, railings, stair hut and air-con units; the player's `P.roof` says which roof they are on, and `game/rooftop.js` holds the door entity. `node tests/roof-shots.mjs <folder>` takes screenshots of a door and its roof by day and night.

**A new landmark.** Add a model file to `world/landmark-models/` and list it in `LANDMARK_MODELS` (it builds with the small kit in `kit.js`, in block-local metres with the front facing north, and marks its solid volumes with `k.solid()`), then place it in `LANDMARK_SITES` in `world/landmarks.js` with the block it takes and the street it faces, and give it a name sign in `SIGNS` there. Preview it at `/dev/landmarks.html?b=<type>`. The three Flemish government buildings (VAC Gent, the Herman Teirlinck and the Belpaire building) are worked examples. A site can also point at a `.glb` file instead (see `world/models.js`).

**A building made in another tool.** Export it as glTF binary (`.glb`) into `public/models/` and give its site a `model`: `{ block: [2, 3], type: 'vac', face: 'e', model: 'vac.glb' }`. The game loads it before building the city (`world/models.js`, Three's GLTFLoader from the same CDN build) and draws it in place of the builder; if the file is missing or broken the site falls back to its builder (or a plain block when `type` is left out). For it to drop in cleanly:
- **Scale and orientation:** 1 unit = 1 metre, Y up, origin at the middle of the footprint at ground level, front facing +Z. In Blender: model the building facing the Front view (−Y), apply all transforms, and export glTF Binary with "+Y Up" on (the default). The lot is 32 × 32 m (−16..16 on X and Z); `face` turns the front to the street.
- **Low poly:** keep it under about 5–10k triangles. CI renders on a slow software GPU.
- **Materials:** plain colours, vertex colours or one small texture atlas (1024 px or less). Materials are turned into the city's flat Lambert shading, so roughness, metalness and normal maps are ignored. Colours show as you picked them.
- **Lit windows and signs:** give them their own material with an Emission colour (for example `Windows_lit`). Every emissive material glows faintly by day and fully at night, like the other buildings.
- **Collision:** add one or more boxes named `collider…` (they are not drawn) for what the player bumps into; without one the whole model's bounding box is used. Boxes are axis aligned, so an L-shaped building wants one box per wing.
- **No compression:** skip Draco and meshopt for now; they need extra decoder files.

`public/models/test-building.glb` is a worked example, written by `node tests/make-test-model.mjs`.

**A new setting.** Add a row to `SETTINGS` in `core/settings.js` (a toggle, range or choice, on the Sound, Graphics or Gameplay tab), then read `settings.<id>` where it matters or apply it in `apply()` in `ui/settings.js`. The Settings screen, saving and validation pick it up on their own.

**A sound from something in the world.** Pass where it comes from: `Sound.shot(kind, vol, at(entity, height))` and the other one-shots take a world point (`at`, `beside` in `core/spatial.js`), and looping sources go through `Sound.loops(kind, sources)` once a frame. Each plays through its own HRTF panner relative to a listener at the player's head facing the camera, with inverse-distance falloff and distance dulling by the profile in `HEAR`. Sounds with no source (UI, the player's own gun) take no point.

**Saves.** When the save shape changes, bump `SAVE_VERSION` in `core/save.js` and add a migration from the previous version.

## Tests

```bash
npm test             # unit tests (Vitest): rules, shop items, save migration, registry cross-checks
npm run test:smoke   # plays the game in headless Chromium: walk, drive, ride, shoot, carjack, shop, go up to a roof, a 5-star chase
```

The registry tests catch a typo in a new vehicle, NPC or shop (an unknown kind, behaviour, weapon or item type). Opening the game with `?debug` exposes its state as `window.__neonbay`. CI runs the unit tests on every pull request. The smoke test is too slow and timing-sensitive for shared CI runners, so it runs locally instead: `npm run test:smoke` must pass on your machine before a pull request is merged (run `npx playwright install chromium` once first).

## Develop and deploy

```bash
npm install
npm run dev      # local server via wrangler pages dev
```

Deploys run automatically through the Cloudflare Pages GitHub integration (project `mbp-scrum-city`):

- Pushing to `main` deploys to production.
- Pushing any other branch or opening a pull request creates a preview deployment.

There is no build step. Pages serves the `public/` directory as is.

Because file URLs never change, `public/_headers` sends `Cache-Control: no-cache` so browsers revalidate every file on each load and pick up a new deploy straight away (unchanged files come back as a small 304).
