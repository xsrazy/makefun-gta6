# Neon Harbor — an open-world crime game (make.fun gta6-01)

Neon Harbor is a top-down 2D open-world crime game that runs entirely offline
in a desktop browser from static files. Explore a sun-soaked coastal city on
foot and by car, steal vehicles, outrun the police, and climb the Harbor
syndicate through six story missions.

## Play

Serve `game/` with any static HTTP server and open `game/index.html`, or run
`node serve.ts` and open http://localhost:8080.

### Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse | Aim |
| Left click | Shoot (on foot and drive-by) |
| E | Enter / exit car |
| Shift | Sprint |
| Space | Handbrake |
| R | Reload |
| P / Esc | Pause |
| M | Mute |

## Features

- A procedural coastal city: gridded streets, a beach, docks, a park, and
  distinct districts, all generated from a seed
- Traffic cars that follow the road network and pedestrians on the sidewalks
- A five-star wanted system with pursuing police cars and foot officers
- On-foot and in-car combat with a pistol, reloads, and drive-by shooting
- Six story missions with objectives, timers, rewards, and a finale
- HUD with health, money, wanted stars, a live minimap, and mission tracker
- Synthesized sound (WebAudio): engine, sirens, gunfire, and music — no audio
  files, no network requests
- Save / continue via localStorage, and a start screen with the story so far
- Screenshot presets (`?shot=chase`, `?shot=street`, `?shot=mission`,
  `?shot=start`) used by `take-shots.mjs`

## Layout

- `game/` — the playable game, plain static files (`index.html` + ES modules
  under `game/src/`, one file per system)
- `screenshots/` — four real renders of the game, taken in headless Chrome
- `main.ts` — the entry program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` with the kit's vendored library
- `playtest.mjs` — headless playtest driver (CDP, no dependencies)
- `verify-missions.mjs` — headless check that all six missions complete
- `take-shots.mjs` — captures the four screenshots from `shots.json`

## Verify locally

```sh
node playtest.mjs          # plays the game in headless Chrome, 17 checks
node verify-missions.mjs   # drives all six missions to completion, 30 checks
node take-shots.mjs        # re-captures screenshots/ from the game
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # build the dossier
```

## License

MIT — see `LICENSE`.
