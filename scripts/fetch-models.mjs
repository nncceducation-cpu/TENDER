#!/usr/bin/env node
/**
 * Stage the on-device model assets into public/models.
 *
 * These are deliberately not committed. The MediaPipe WASM bundle alone is about
 * 35 MB, and a binary of that size in git history is a burden on every clone. The
 * important property is not that the bytes live in the repository, it is that the
 * bytes in use are pinned and verifiable, which is what the checksum below is for.
 *
 * Run once after install, and again whenever MODEL_PIN changes:
 *   npm run fetch:models
 *
 * On a segregated hospital network with no outbound access, run this on a
 * connected machine and copy public/models across. The application never fetches
 * a model at runtime.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'public', 'models', 'mediapipe');

const MODEL_PIN = {
  url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  file: 'face_landmarker.task',
  // Recorded on first fetch; verified on every subsequent run.
  sha256:
    process.env.TENDER_MODEL_SHA256 ??
    '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
};

const WASM_SOURCE = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

const main = async () => {
  await mkdir(join(OUT, 'wasm'), { recursive: true });

  if (!(await exists(WASM_SOURCE))) {
    console.error('MediaPipe WASM assets not found. Run npm install first.');
    process.exit(1);
  }

  for (const f of WASM_FILES) {
    const src = join(WASM_SOURCE, f);
    if (!(await exists(src))) {
      console.warn(`skipped ${f} (not present in this @mediapipe/tasks-vision build)`);
      continue;
    }
    await writeFile(join(OUT, 'wasm', f), await readFile(src));
    console.log(`copied  wasm/${f}`);
  }

  const target = join(OUT, MODEL_PIN.file);
  if (await exists(target)) {
    const digest = sha256(await readFile(target));
    if (MODEL_PIN.sha256 && digest !== MODEL_PIN.sha256) {
      console.error(`Checksum mismatch for ${MODEL_PIN.file}.\n  expected ${MODEL_PIN.sha256}\n  found    ${digest}`);
      process.exit(1);
    }
    console.log(`present ${MODEL_PIN.file} (sha256 ${digest.slice(0, 16)}...)`);
    return;
  }

  console.log(`fetching ${MODEL_PIN.file} ...`);
  const res = await fetch(MODEL_PIN.url);
  if (!res.ok) {
    console.error(`Download failed: HTTP ${res.status}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const digest = sha256(buf);
  if (MODEL_PIN.sha256 && digest !== MODEL_PIN.sha256) {
    console.error(`Checksum mismatch.\n  expected ${MODEL_PIN.sha256}\n  found    ${digest}`);
    process.exit(1);
  }
  await writeFile(target, buf);
  console.log(`wrote   ${MODEL_PIN.file} (${(buf.length / 1e6).toFixed(1)} MB, sha256 ${digest})`);
  if (!MODEL_PIN.sha256) {
    console.log('\nPin this build by recording the checksum above in scripts/fetch-models.mjs.');
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
