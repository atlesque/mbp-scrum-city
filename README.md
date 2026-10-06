# MBP - Scrum City

A low-poly 80s beach-city shooter that runs in desktop browsers. Shoot for cash, outrun the wanted level, and spend the money on better guns at Bullet Bros. Guns.

**Live:** https://mbp-scrum-city.atlesque.dev (also https://mbp-scrum-city.pages.dev)

## Gameplay

- Taking people down drops cash and raises your wanted level (1–5 stars).
- Each star brings tougher enemies: police, police cars, SWAT, federal agents with a helicopter, then soldiers and minigun heavies.
- Downed police, SWAT, feds, soldiers and heavies can also drop armor (blue) and ammo (yellow) for every gun you own that uses it. Tougher enemies drop more often; a heavy always drops both.
- Break line of sight with the law and the stars flash and fade one at a time.
- Two gun shops (pink `$` on the radar) sell an SMG, shotgun, assault rifle, minigun and rocket launcher, plus upgrades, ammo, health and armor. They close at 4+ stars.
- Adventure bikes cruise the streets (white dots on the radar): the black BMW R 1300 GS 'Triple Black' and the Yamaha Ténéré 700 Rally in blue rally livery. Shoot or ram the rider off, walk up and press `F` to take the bike. Riderless bikes show as cyan squares.
- Every car can be driven: 80s sedans and the white Tesla Model Y. Traffic cars have someone at the wheel. Shoot them through the glass, or walk up to a slow or stopped car and press `F` to drag them out (that's a crime). Parked cars are free to take. Cars crash into each other: drive into one and it skids off, dented and spinning if you hit it off-centre, and can knock into the next one along.
- Dying sends you to City General with a 10% hospital bill. Progress saves in `localStorage`.
- **Settings** (pause menu or title screen): sound on/off, effects and music volume, render quality, draw distance, animated waves, mouse sensitivity, invert look, field of view, camera shake, crowd and traffic density, km/h or mph, and a read-only list of the controls. Settings save in this browser, separately from game progress.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look and aim (click to capture the mouse) |
| Left click / right click | Shoot / zoom aim |
| Shift / Space | Sprint / jump |
| E | Enter a gun shop |
| F | Get on or off a motorcycle, get in or out of a car, pull a driver out of their car |
| On a bike: W / S, A / D, Shift, Space | Throttle / brake, lean, boost, rear brake. You can still shoot. |
| In a car: W / S, A / D, Shift, Space | Gas / brake, steer, boost, handbrake |
| 1–6, mouse wheel | Switch weapons |
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
  world/             city layout, collision, radar
  render/ ui/ characters/ combat/ data/
```

Everything in the world is an entity in `entities/registry.js`. Entities opt into traits (`update`, `raycast`, `onShot`, `blast`, `pushOut`, `blip`, `interaction`, `shouldDespawn`, `dispose`), so shooting, explosions, collisions, the radar and the E/F prompt work for anything new without touching those systems. Systems talk through `core/events.js` (`npc:killed`, `vehicle:wrecked`, `shop:purchase`, …); `game/rewards.js` turns those into cash, drops and heat.

Alongside the code in `public/`: the favicon set, `site.webmanifest`, the share image `og-image.jpg`, `robots.txt` and `sitemap.xml`.

## Extending the game

**A new vehicle.** Add a file to `public/js/vehicles/models/` whose default export describes it (`id`, `kind`, `name`, `short`, `hp`, `engine`, optional `traffic: { weight, speed }`, and the mesh or geometry its kind expects), then list it in `models/index.js`. `kind: 'bike'` or `'car'` gives it physics, seating, camera and crash rules; a model can override `handling`. A traffic weight above 0 puts it on the roads. A new kind of vehicle (a boat, a truck) is a new file in `vehicles/kinds/` implementing the hooks documented at the top of `kinds/bike.js`.

**A new NPC.** Add an entry to `NPC_TYPES` in `npcs/types.js` (faction, behaviour, hp, look, cash, heat, `drops`, and weapon stats if armed). Spawn it with `spawnNpc(id, x, z)`, through a wanted level's `mix` in `data/wanted.js`, or with a row in `POPULATION` in `game/population.js`. New behaviours go in `npcs/behaviours.js`.

**A new shop.** Add an entry to `SHOP_TYPES` in `shops/types.js` (name, marker, storefront, catalogue) and place it in `SHOP_SITES` in `world/city.js`. New kinds of goods are an entry in `ITEM_TYPES` in `shops/items.js` with `render` and `act`.

**A new landmark.** Add a builder to `LANDMARK_TYPES` in `world/landmarks.js` (it draws in block-local metres with the front facing north) and place it in `LANDMARK_SITES` with the block it takes and the street it faces. The three Flemish government buildings there (VAC Gent, the Herman Teirlinck and the Belpaire building) are worked examples.

**A new setting.** Add a row to `SETTINGS` in `core/settings.js` (a toggle, range or choice, on the Sound, Graphics or Gameplay tab), then read `settings.<id>` where it matters or apply it in `apply()` in `ui/settings.js`. The Settings screen, saving and validation pick it up on their own.

**Saves.** When the save shape changes, bump `SAVE_VERSION` in `core/save.js` and add a migration from the previous version.

## Tests

```bash
npm test             # unit tests (Vitest): rules, shop items, save migration, registry cross-checks
npm run test:smoke   # plays the game in headless Chromium: walk, drive, ride, shoot, carjack, shop, a 5-star chase
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
