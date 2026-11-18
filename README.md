[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/permanaraya26-hash/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/permanaraya26-hash/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# Solmar Bay — an open-world crime game

Sun, sea and trouble. **Solmar Bay** is an original open-world crime game that
runs entirely offline in a desktop browser from static files (three.js r187,
vendored under `game/vendor/`). No Rockstar names, characters, map or assets —
everything here is invented: the city, the people, the story, the art and the
sounds.

You are **Rico Vega**, back in Solmar Bay — a sun-soaked coastal city run by
fixers, cops and fast cars. Work three jobs for fixer **Vera Cruz**, then the
city is yours.

## What is in the game

- **A procedural coastal city** — a 7×7 road grid of buildings with drawn
  facades, a park with a pond, a beach and boardwalk, a pier out over the
  ocean, palms and street lamps.
- **On foot and by car** — walk, run and jump with an orbit camera; steal
  cars and drive them with arcade physics, handbrake, damage, smoke and
  explosions.
- **Traffic and pedestrians** — cars that follow the road grid and brake for
  each other, and sidewalk walkers who flee when trouble starts.
- **Wanted system** — 0–5 stars. The SBPD sends pursuit cars that chase and
  ram, and foot cops at 3+ stars. Get **BUSTED** or **WASTED** and you lose
  20% of your cash and wake up at the Safehouse.
- **Combat** — pistol with hitscan, tracer and muzzle flash (reload with R)
  and a punch (F).
- **Missions and story** — three jobs for Vera Cruz: meet her on the
  boardwalk, steal a car for the garage, collect packages on Pier 7, then
  outrun a 3-star Heat Wave to the Safehouse. After that, free roam with
  respawning cash drops.
- **Full HUD** — cash, health and car-health bars, wanted stars, clock,
  objective with distance, a live minimap, speedometer and ammo counter.
- **Menus and save** — title screen (New Game / Continue / How to play),
  pause menu, and a localStorage save that autosaves on mission completion
  and every 30 seconds.
- **Synthesized sound** — engine hum, two-tone siren, gunshots, pickups and
  jingles, all generated with WebAudio. No audio files.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse drag | Orbit camera, wheel zooms |
| SHIFT | Run |
| SPACE | Jump (on foot) / handbrake (in a car) |
| E | Steal / enter / exit car |
| Click | Shoot |
| F | Punch |
| R | Reload |
| P / Esc | Pause |
| M | Mute |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

## Build the entry

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the kit's `buildDossier`.

## License

MIT — see [LICENSE](LICENSE).
