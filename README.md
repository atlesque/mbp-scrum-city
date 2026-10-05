# Neon Bay '86

A low-poly 80s beach-city shooter that runs in desktop browsers. Shoot for cash, outrun the wanted level, and spend the money on better guns at Bullet Bros. Guns.

**Live:** https://mbp-scrum-city.atlesque.dev (also https://mbp-scrum-city.pages.dev)

## Gameplay

- Taking people down drops cash and raises your wanted level (1–5 stars).
- Each star brings tougher enemies: police, police cars, SWAT, federal agents with a helicopter, then soldiers and minigun heavies.
- Break line of sight with the law and the stars flash and fade one at a time.
- Two gun shops (pink `$` on the radar) sell an SMG, shotgun, assault rifle, minigun and rocket launcher, plus upgrades, ammo, health and armor. They close at 4+ stars.
- Black BMW R 1300 GS 'Triple Black' adventure bikes cruise the streets (white dots on the radar). Shoot or ram the rider off, walk up and press `F` to take the bike. Riderless bikes show as cyan squares.
- Dying sends you to Bay General with a 10% hospital bill. Progress saves in `localStorage`.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look and aim (click to capture the mouse) |
| Left click / right click | Shoot / zoom aim |
| Shift / Space | Sprint / jump |
| E | Enter a gun shop |
| F | Get on or off a motorcycle |
| On a bike: W / S, A / D, Shift, Space | Throttle / brake, lean, boost, rear brake. You can still shoot. |
| 1–6, mouse wheel | Switch weapons |
| R | Reload |
| M | Toggle the radio |
| Esc / P | Pause |

## Project layout

Everything lives in `public/index.html`: the game code, styles, and all sound (synthesized with the Web Audio API). Three.js r128 loads from cdnjs and fonts from Google Fonts. There is no build step.

Alongside it in `public/`: the favicon set (`favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`), `site.webmanifest`, the social share image `og-image.jpg` (1200×630, a capture of the title screen), `robots.txt` and `sitemap.xml`. SEO and Open Graph tags point at the production URL.

## Develop and deploy

```bash
npm install
npm run dev      # local server via wrangler pages dev
```

Deploys run automatically through the Cloudflare Pages GitHub integration (project `mbp-scrum-city`):

- Pushing to `main` deploys to production.
- Pushing any other branch or opening a pull request creates a preview deployment.

There is no build step. Pages serves the `public/` directory as is.
