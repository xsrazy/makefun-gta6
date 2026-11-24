// Neon Harbor — entry program for make.fun gta6-01 (Node 22, stdlib only).
//
// The game is the static files under game/ beside this file: index.html plus
// its ES modules, no build step and no network request at run time. This
// program hands the entry in: it copies game/ and screenshots/ into the
// output directory and writes dossier.json there with the kit's vendored
// buildDossier library, which the scorer re-derives byte for byte.
//
// Run it outside the grader with MAKEFUN_OUTPUT_DIR standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Serve the game itself with `node serve.ts` (http://localhost:8080).

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
}

// The whole game, then the screenshots, then the dossier the judge reads.
mkdirSync(outDir, { recursive: true });
copyTree(join(repoRoot, 'game'), join(outDir, 'game'));
if (existsSync(join(repoRoot, 'screenshots'))) {
  copyTree(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
} else {
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
}

// Caps from the gate (reference/gate.json): the dossier text cap shapes the
// bytes; the rest refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; game/ over 993 entries or 48 MiB, or a
// path under game/ over 1000 bytes).
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
