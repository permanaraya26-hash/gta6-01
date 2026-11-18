// Solmar Bay — entry program for the make.fun "Make GTA 6" bounty (gta6-01).
// Node 22, standard library only. Copies game/ and screenshots/ from this
// repository into /output (or $MAKEFUN_OUTPUT_DIR) and writes
// /output/dossier.json with the kit's vendored buildDossier, then validates
// its own output: the dossier must be byte-identical when built twice, and
// the screenshots must be inside the gate caps the scorer enforces.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// --- caps the gate enforces (reference/gate.json) ------------------------
const MAX_SHOTS = 4;
const MAX_SHOT_BYTES = 262144;        // 256 KiB each
const MAX_DOSSIER_BYTES = 1572864;    // 1.5 MiB
const TEXT_MAX_BYTES = 163840;        // dossier text cap
const GAME_MAX_FILES = 993;
const GAME_MAX_BYTES = 50331648;      // 48 MiB
const GAME_PATH_MAX_BYTES = 1000;

function fail(message: string): never {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkFiles(p, out);
    else if (st.isFile()) out.push(p);
  }
  return out;
}

// --- pre-flight checks on the source tree --------------------------------
const gameDir = join(here, 'game');
if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
const gameFiles = walkFiles(gameDir);
if (gameFiles.length > GAME_MAX_FILES) fail(`game/ has ${gameFiles.length} files (cap ${GAME_MAX_FILES})`);
let gameBytes = 0;
for (const f of gameFiles) {
  gameBytes += statSync(f).size;
  const rel = f.slice(gameDir.length + 1);
  if (Buffer.byteLength(rel, 'utf8') > GAME_PATH_MAX_BYTES) fail(`game path too long: ${rel}`);
}
if (gameBytes > GAME_MAX_BYTES) fail(`game/ is ${gameBytes} bytes (cap ${GAME_MAX_BYTES})`);

const shotsDir = join(here, 'screenshots');
if (!existsSync(shotsDir)) fail('screenshots/ is missing');
const shots = readdirSync(shotsDir)
  .filter((n) => !n.startsWith('.'))
  .sort();
if (shots.length < 3 || shots.length > MAX_SHOTS) {
  fail(`screenshots/ holds ${shots.length} images (need 3–${MAX_SHOTS})`);
}
for (const name of shots) {
  const p = join(shotsDir, name);
  const st = statSync(p);
  if (!st.isFile()) fail(`screenshots/${name} is not a regular file`);
  if (!/^[A-Za-z0-9._-]+$/.test(name)) fail(`screenshots/${name} has an illegal name`);
  if (st.size > MAX_SHOT_BYTES) fail(`screenshots/${name} is ${st.size} bytes (cap ${MAX_SHOT_BYTES})`);
  const head = readFileSync(p).subarray(0, 3);
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e;
  if (!isJpeg && !isPng) fail(`screenshots/${name} is not a JPEG or PNG`);
}

// --- copy -----------------------------------------------------------------
mkdirSync(out, { recursive: true });
rmSync(join(out, 'game'), { recursive: true, force: true });
rmSync(join(out, 'screenshots'), { recursive: true, force: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// --- dossier, built twice: the two runs must agree byte for byte ---------
const dossierOptions = {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: { max: MAX_SHOTS, max_bytes: MAX_SHOT_BYTES },
  game_max_files: GAME_MAX_FILES,
  game_max_bytes: GAME_MAX_BYTES,
  game_path_max_bytes: GAME_PATH_MAX_BYTES,
};
// buildDossier returns a Uint8Array; compare the bytes, not the objects.
const first = Buffer.from(buildDossier(out, dossierOptions));
const second = Buffer.from(buildDossier(out, dossierOptions));
if (!first.equals(second)) fail('dossier is not deterministic across two builds');
if (first.length > MAX_DOSSIER_BYTES) {
  fail(`dossier.json is ${first.length} bytes (cap ${MAX_DOSSIER_BYTES})`);
}
writeFileSync(join(out, 'dossier.json'), first);

console.log(`Solmar Bay handed in: ${gameFiles.length} game files (${gameBytes} bytes), `
  + `${shots.length} screenshots, dossier ${first.length} bytes — deterministic.`);
