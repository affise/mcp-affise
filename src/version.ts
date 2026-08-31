import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SERVER_VERSION: string = JSON.parse(
  readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
).version;
