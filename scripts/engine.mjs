// Joins src/engine/*.js (in filename order) into the single engine script the app runs.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ENGINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/engine');

export function engineFiles() {
  return readdirSync(ENGINE_DIR).filter((f) => f.endsWith('.js')).sort();
}

export function buildEngine() {
  return engineFiles()
    .map((f) => `/* ===== src/engine/${f} ===== */\n${readFileSync(path.join(ENGINE_DIR, f), 'utf8')}`)
    .join('\n');
}
