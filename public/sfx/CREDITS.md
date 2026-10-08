# Sound credits

Every recorded sound here is CC0 (public domain, https://creativecommons.org/publicdomain/zero/1.0/), from OpenGameArt.
Each file was trimmed, mixed, level-matched and saved as mono MP3 for the game (64 kbps for the reloads, 96 kbps for the gunshots so the crack stays sharp). Everything else is synthesized in `js/core/audio.js`.

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
