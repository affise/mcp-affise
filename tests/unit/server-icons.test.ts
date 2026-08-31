/**
 * The stdio server has nowhere to serve an icon from, so `serverInfo.icons`
 * carries `data:` URIs — which the spec allows alongside http(s). That also
 * keeps a local install from reaching out to affise.com on every handshake
 * just to draw a logo.
 *
 * Separately, the DXT manifest's `icon` is a path *inside the bundle*, and
 * `.dxtignore` excludes whole directories — so an icon that resolves in the
 * repo can still be missing from the packed extension. Both are pinned here.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { ICON_ASSETS, serverIcons } from '../../src/icons.js';

const root = resolve(__dirname, '../..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

const pngDimensions = (buf: Buffer) => `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;

describe('serverInfo.icons', () => {
  it('embeds every asset as a data: URI a client needs no network for', () => {
    const icons = serverIcons();
    expect(icons).toHaveLength(ICON_ASSETS.length);
    for (const icon of icons) {
      expect(icon.src, 'stdio has no host to serve an http src from')
        .toMatch(/^data:image\/png;base64,/);
      expect(icon.mimeType).toBe('image/png');
    }
  });

  it('embeds real PNGs of the size each entry declares', () => {
    for (const icon of serverIcons()) {
      const bytes = Buffer.from(icon.src.replace(/^data:image\/png;base64,/, ''), 'base64');
      expect(bytes.readUInt32BE(0), 'decoded payload is not a PNG').toBe(0x89504e47);
      expect(pngDimensions(bytes), `declared ${icon.sizes[0]}`).toBe(icon.sizes[0]);
    }
  });

  it('resolves the assets from the package root, in the repo and in the tarball', () => {
    // icons.ts sits at src/icons.ts here and build/icons.js in the package, so
    // resolving `./assets` relative to the module would mean two different
    // directories — and the first version of this did exactly that, returning
    // no icons under test. One location, shipped via package.json "files".
    for (const { file } of ICON_ASSETS) {
      expect(existsSync(resolve(root, 'assets', file)), `assets/${file} missing`).toBe(true);
    }
    expect(serverIcons().length, 'serverIcons() found nothing to embed').toBe(ICON_ASSETS.length);

    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    expect(pkg.files, 'assets must ship in the npm tarball or the icons vanish')
      .toContain('assets');
  });
});

describe('DXT manifest icon', () => {
  it('names a file that exists', () => {
    expect(manifest.icon, 'manifest has no icon').toBeTruthy();
    expect(existsSync(resolve(root, manifest.icon)), `${manifest.icon} does not exist`).toBe(true);
  });

  it('is a PNG, the format every icon-rendering client must support', () => {
    const bytes = readFileSync(resolve(root, manifest.icon));
    expect(bytes.readUInt32BE(0)).toBe(0x89504e47);
  });

  it('sits outside every path .dxtignore excludes, so it reaches the bundle', () => {
    const ignore = readFileSync(resolve(root, '.dxtignore'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.startsWith('/'))
      .map((l) => l.replace(/^\//, '').replace(/\/$/, ''));

    const top = String(manifest.icon).split('/')[0];
    expect(ignore, `manifest.icon lives under /${top}/, which .dxtignore drops`)
      .not.toContain(top);
  });
});
