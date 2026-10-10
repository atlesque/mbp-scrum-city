# Sound credits

Every recorded sound here is CC0 (public domain, https://creativecommons.org/publicdomain/zero/1.0/), from OpenGameArt and Freesound.
Each file was trimmed, mixed, level-matched and saved as MP3 for the game: mono at 64 kbps for the reloads, the gull calls, the surf and the fountain, mono at 96 kbps for the gunshots so the crack stays sharp and for the bullet impacts, and stereo at 96 kbps for the ambience beds (city day, city night, wind). Everything else is synthesized in `js/core/audio.js`.

## Gunshots

Every gunshot is a real gun recorded at a range for The Free Firearm Sound Library (Kickstarter-funded, 2013) and released as CC0, from OpenGameArt: https://opengameart.org/content/the-free-firearm-sound-library (the "Prepared SFX Library", near-distance takes). Each numbered file is a separate shot cut from the take, with its natural slap-back from the range kept, compressed a little so the body carries as well as the crack.

| Files | Built from |
| --- | --- |
| `shot-pistol-1` to `-3` | Walther PPQ 9 mm, `X_39P.wav` |
| `shot-smg-1` to `-3` | Carl Gustav M/45 9 mm, single shots, `G_31P.wav` |
| `shot-rifle-1` to `-4` | AK-47, single shots, `C_28P.wav` |
| `shot-minigun-1` to `-4` | PPSh-41, single shots, `P_30P.wav`, slowed to 90% and cut to 0.2 s |
| `shot-shotgun-1`, `-2` | Benelli Nova 12 gauge, `O_21P.wav`, then the pump: `shotguncock_0.wav` by springyspringo (CC0, https://opengameart.org/content/gun-reload-sounds) |
| `shot-sniper-1` to `-3` | Mosin-Nagant 7.62x54R, `M_21P.wav`, then the bolt: `gun_reload_lock_or_click_sound.mp3` by pauliuw (CC0, https://opengameart.org/content/gun-reload-lock-or-click-sound) |
| `shot-rpg-1`, `-2` | Mossberg 190 12 gauge, `N_30P.wav`, slowed to 55% (the backblast), with `boost_0.mp3` by ezduzziteh (CC0, https://opengameart.org/content/boost-or-launch-or-thruster-sound-effect) and `missile.wav` by mikeask (CC0, https://opengameart.org/content/missile-sound) fading out (the motor) |
| `shot-laser-1` to `-3` (the aliens' laser rifle) | Synthesized for this game (a falling square-wave zap with a fizz and a short slap-back), released as CC0 like the rest |
| `shot-cannon-1` (the tank) | `cannon_fire_0.ogg` by thimras (CC0, https://opengameart.org/content/cannon-fire) |

## Bullet impacts

No CC0 recordings of real bullet impacts could be found, so each surface is built from CC0 foley hits, often two or three layered (a crack or crunch on top, a thud or plop under it for body). Every take comes from a different source hit, cut to start right on it (0.25 to 0.5 s), high-passed at 60 Hz and loudness-matched across surfaces. The game plays them well under the gunshots.

| Files | Built from | Author | Source |
| --- | --- | --- | --- |
| `impact-brick-1` to `-3` | `bfh1_rock_hit_01.ogg`, `bfh1_rock_breaking_02.ogg`, `bfh1_rock_breaking_03.ogg`, `bfh1_rock_falling_04.ogg`, `bfh1_rock_falling_07.ogg` | rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx |
| | with `impactSoft_medium_000.ogg`, `impactSoft_medium_003.ogg`, `impactGeneric_light_002.ogg` (body thud) | Kenney | https://kenney.nl/assets/impact-sounds |
| `impact-sand-1` to `-3` | `impactSoft_heavy_000.ogg`, `_002.ogg`, `_004.ogg` | Kenney | https://kenney.nl/assets/impact-sounds |
| | with three steps cut from `sand_footsteps_0.mp3` | Peludo | https://opengameart.org/content/water-splash-and-sand-footsteps |
| `impact-wood-1`, `-3` | `wood_hit_04.ogg`, `wood_hit_02.ogg` | rubberduck | https://opengameart.org/content/100-cc0-metal-and-wood-sfx |
| | with `impactWood_medium_002.ogg`, `impactWood_medium_000.ogg` | Kenney | https://kenney.nl/assets/impact-sounds |
| `impact-wood-2` | `crack07.mp3.flac` | qubodup | https://opengameart.org/content/35-wooden-crackshitsdestructions |
| `impact-water-1`, `-2` | `splash_09.ogg`, `splash_03.ogg` | rubberduck | https://opengameart.org/content/40-cc0-water-splash-slime-sfx |
| `impact-water-1`, `-3` | `plop_01.ogg`, `plop_02.ogg` | rubberduck | https://opengameart.org/content/100-cc0-sfx |
| `impact-water-3` | `water_splash-05.flac` | qubodup | https://opengameart.org/content/6-short-water-splashes |
| `impact-metal-1`, `-2` | `impactMetal_light_003.ogg`, `impactMetal_medium_001.ogg` | Kenney | https://kenney.nl/assets/impact-sounds |
| `impact-metal-2` | `clink3.wav` | BMacZero | https://opengameart.org/content/metal-impact-sounds |
| `impact-metal-3` | `metal_hit_04.ogg` | rubberduck | https://opengameart.org/content/100-cc0-metal-and-wood-sfx |
| `impact-flesh-1` | `impactPunch_heavy_001.ogg` | Kenney | https://kenney.nl/assets/impact-sounds |
| | with a short squelch from `rippingintomeat_0.mp3` | Eldritch Grim | https://opengameart.org/content/ripping-into-meat |
| `impact-flesh-2`, `-3` | `hit12.mp3.flac`, `hit17.mp3.flac` | qubodup | https://opengameart.org/content/37-hitspunches |
| `impact-flesh-3` | with `impactPunch_medium_003.ogg` | Kenney | https://kenney.nl/assets/impact-sounds |

## Reloads

| File | Built from | Author | Source |
| --- | --- | --- | --- |
| `reload-pistol.mp3` | `reload.wav`, sped up to fit the 1.1 s reload | zer0sol | https://opengameart.org/content/handgun-reload-sound-effect |
| `reload-smg.mp3` | `gunreload1.wav` | springyspringo | https://opengameart.org/content/gun-reload-sounds |
| `reload-rifle.mp3` | `assaultriflereload1_0.wav` | springyspringo | https://opengameart.org/content/gun-reload-sounds |
| `reload-shotgun.mp3` | `First Shell.mp3` and `Subsequent Shells.mp3` (three shells) | zer0sol | https://opengameart.org/content/shotgun-reload-sound-effects |
| | then `shotguncock_0.wav` (the pump) | springyspringo | https://opengameart.org/content/gun-reload-sounds |
| `reload-minigun.mp3` | `clipload2.wav`, `singlebullet1.wav`, `clipload1.wav`, pitched down | bmaczero | https://opengameart.org/content/gun-reload-sound-effects |
| | then `gun_reload_lock_or_click_sound.mp3` (the latch) | pauliuw | https://opengameart.org/content/gun-reload-lock-or-click-sound |
| `reload-rpg.mp3` | `gun_reload.1.ogg`, pitched down | starninjas | https://opengameart.org/content/2-gun-reloads |
| | then `gun_reload_lock_or_click_sound.mp3`, pitched down | pauliuw | https://opengameart.org/content/gun-reload-lock-or-click-sound |
| `reload-sniper.mp3` | `gun_reload_lock_or_click_sound.mp3` (the bolt), pitched down | pauliuw | https://opengameart.org/content/gun-reload-lock-or-click-sound |
| | then `assaultriflereload1_0.wav` (the magazine) and `shotguncock_0.wav` (the bolt going home), pitched up | springyspringo | https://opengameart.org/content/gun-reload-sounds |

## Ambience

All from Freesound, each checked as CC0 on its own sound page (the HQ previews were used). Every file was high-passed (40 Hz or more) with DC removed. The loops were cut from a steady stretch, made seamless by crossfading the last 2 s into the first 2 s (equal-power), checked by playing them twice in a row (no level step at the seam), and levelled to about -24 LUFS for the beds and -20 LUFS for the surf and the fountain. The gull calls were cut tight with short fades, lightly denoised and peak-normalized to about -3 dBFS.

| File | Built from | Author | Source |
| --- | --- | --- | --- |
| `amb-surf.mp3` | `waves_1.wav`, a 26.5 s loop, high-passed at 65 Hz to drop the wind rumble | haldigital97 | https://freesound.org/people/haldigital97/sounds/241824/ |
| `amb-gull-1.mp3` | `Seagull on beach`, one call (0.76 s), high-passed at 450 Hz | squashy555 | https://freesound.org/people/squashy555/sounds/353416/ |
| `amb-gull-2.mp3` | `Seagull on beach`, a short series of four calls (2.4 s), high-passed at 450 Hz | squashy555 | https://freesound.org/people/squashy555/sounds/353416/ |
| `amb-gull-3.mp3` | `sea gulls.wav`, a laughing call series (1.9 s), high-passed at 650 Hz | Snapper4298 | https://freesound.org/people/Snapper4298/sounds/166703/ |
| `amb-city-day.mp3` | `City hum #1` (distant traffic across a lake), a 50 s loop | morosopher | https://freesound.org/people/morosopher/sounds/179117/ |
| | with `geroezemoes.wav` (indistinct crowd), two 50 s loops placed left and right, low-passed at 2 kHz and mixed about 7 dB under the traffic | gecop | https://freesound.org/people/gecop/sounds/640254/ |
| `amb-city-night.mp3` | `AMBSubn-Summer_Golf Course at Night, crickets, frogs, insects, distant traffic_QCF_Gulf Shores Alabama_Zoom H1n`, a 50 s loop, the shrill insect band near 7.6 kHz turned down 4 dB | treytatum3 | https://freesound.org/people/treytatum3/sounds/812214/ |
| | with `City hum #1` (another stretch), low-passed at 1.2 kHz as a faint far-off city hush about 10 dB under | morosopher | https://freesound.org/people/morosopher/sounds/179117/ |
| `amb-wind.mp3` | `winter wind 01a.aiff`, a 31 s loop, high-passed at 80 Hz (no buffeting) | klangfabrik | https://freesound.org/people/klangfabrik/sounds/117504/ |
| `amb-fountain.mp3` | `Water from a Fountain Splashing into the Basin - Recording close to the Fountain Tap`, a 12.25 s loop, high-passed at 90 Hz, splash peaks limited | bassimat | https://freesound.org/people/bassimat/sounds/863058/ |
