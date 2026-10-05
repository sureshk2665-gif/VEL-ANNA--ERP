// Syntax-checks the joined engine script (what the browser actually runs).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildEngine, engineFiles } from './engine.mjs';

const out = path.join(mkdtempSync(path.join(tmpdir(), 'vipl-engine-')), 'engine.js');
writeFileSync(out, buildEngine());
try {
  execFileSync(process.execPath, ['--check', out], { stdio: 'pipe' });
} catch (e) {
  console.error(`Syntax error in joined engine (look for the "===== src/engine/…" banner above the line):\n${e.stderr}`);
  process.exit(1);
}
console.log(`OK — ${engineFiles().length} engine files`);
