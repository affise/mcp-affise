import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved from the package root, not from this module's directory: the
// module sits at src/icons.ts in the repo and build/icons.js in the package,
// so `./assets` would mean two different places. `assets` ships via
// package.json "files", which is also where the DXT manifest's `icon` points.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = path.join(packageRoot, 'assets');

const ASSETS = [
  { file: 'affise-icon-192.png', sizes: ['192x192'] },
  { file: 'affise-icon-32.png', sizes: ['32x32'] },
] as const;

export interface ServerIcon {
  src: string;
  mimeType: string;
  sizes: string[];
}

export const ICON_ASSETS = ASSETS;

export function serverIcons(): ServerIcon[] {
  const icons: ServerIcon[] = [];
  for (const { file, sizes } of ASSETS) {
    try {
      const bytes = readFileSync(path.join(assetDir, file));
      icons.push({
        src: `data:image/png;base64,${bytes.toString('base64')}`,
        mimeType: 'image/png',
        sizes: [...sizes],
      });
    } catch {
      continue;
    }
  }
  return icons;
}
