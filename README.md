[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/permanaraya26-hash/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/permanaraya26-hash/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# Solmar Bay — an open-world crime game

**Solmar Bay** is an original open-world crime game built for the make.fun
"Make GTA 6" bounty (gta6-01). It runs entirely from static files in `game/`
— no build step, no network requests, three.js vendored under `game/vendor/`.

You play Rico, a driver fresh out of luck in Solmar Bay, a sun-soaked coastal
city of seven-by-seven gridded streets, a palm park, a beach, a boardwalk and
Pier 7. A fixer named Vera Cruz has four jobs for you: meet her at the pier,
steal a car and deliver it to the garage, collect three packages off the pier,
then a three-star Heat Wave escape back to the Safehouse. After the story,
free roam continues with respawning cash drops.

## What is in the game

- **A living city** — ~70 procedural buildings, traffic that follows the road
  grid and brakes for cars and pedestrians, 30 pedestrians who stroll the
  sidewalks and flee from crimes, a park with a pond, palms, lamps and clouds.
- **On foot and by car** — walk, run and jump as Rico; steal any of 8 named
  cars (Comet GT, Palm Runner, Bay Cruiser…) and drive with arcade physics,
  handbrake slides, damage, smoke and explosions.
- **Wanted level and the SBPD** — 0–5 stars. Pursuit cars chase with
  separation and avoidance steering so units never pile into each other,
  ram on a cooldown, and pull up beside you to make an arrest; foot cops
  join at 3+ stars, punch up close and open fire from range. Get BUSTED or
  WASTED and you lose 20% of your cash and wake up at the Safehouse.
- **Combat** — pistol with hitscan, tracer, muzzle flash and reload, plus a
  punch. Shooting at cops, cars or pedestrians raises your wanted level.
- **HUD and menus** — cash, health and car-health bars, wanted stars (flashing
  at 5), in-game clock, objective with distance, live 2D minimap with police
  and mission blips, speedometer, ammo counter, toasts, a start screen
  (New Game / Continue / How to play), a pause menu and localStorage saves
  (auto-save on mission complete and every 30 seconds).
- **Sound** — fully synthesized WebAudio: engine hum, two-tone sirens,
  gunshots, pickup and cash jingles. No audio files.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Shift | Run |
| Space | Jump (on foot) / handbrake (driving) |
| E | Enter / exit car |
| Mouse click | Shoot (on foot) |
| F | Punch |
| R | Reload |
| P / Esc | Pause |
| M | Mute |

Drag the mouse to orbit the camera; scroll to zoom.

## Play it

```sh
node serve.ts --port 8080   # then open http://localhost:8080
```

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to the output directory and writes `dossier.json` with the kit's vendored
`buildDossier` from `vendor/makefun-game.ts`, then validates its own output
(the dossier must be byte-identical when built twice, and the screenshots
must sit inside the gate caps).

## Screenshots

`1-cover.jpg` — a police chase at 3 stars, HUD and minimap live.
`2-foot.jpg` — Rico on foot by Palm Court Park. `3-mission.jpg` — a package
pickup on Pier 7. `4-start.jpg` — the title screen over the whole city.

## Rebuild status (recorded stages)

The entry is being re-written under fresh sealed recordings because the two
recordings that built it first could not be entered (recording 1 sealed but
its builders began before it; recording 2 never sealed — the site sealed it
while the local recorder was a chunk behind, and it witnessed almost none of
the builders' sessions).

- **Stage 1 (recording 01a1ec8a):** the four core files were rewritten in a
  new structure with the same systems and tuning — `game/src/city.js` (the
  procedural coastal city: road grid, blocks, park, beach, pier, palms,
  lamps, clouds), `game/src/police.js` (SBPD pursuit cars with separation
  and avoidance steering, rams on a cooldown, foot cops who punch and open
  fire at 3+ stars, wanted decay), `game/src/vehicles.js` (car models,
  traffic AI, arcade driving, damage/smoke/explosions) and `game/src/main.js`
  (bootstrap, game loop, camera, input, menus, new/continue game). All four
  parse as ES modules, every named import resolves, and a headless-Chromium
  smoke test loads the game (WebGL canvas, HUD and menus mount, no JS
  errors). Later stages rewrite the remaining source files and re-take the
  screenshots.

## License

MIT — see [LICENSE](LICENSE).
