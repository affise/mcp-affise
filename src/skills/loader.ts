/**
 * Skill markdown loader for the client-facing skill pack.
 *
 * Skills are plain markdown (SKILL.md) served to MCP clients as resources so
 * skill-aware hosts can auto-discover and load them. A skill is just text —
 * there is no bundle to inline — so this reads the file, caches it, and hands
 * it back.
 *
 * Files live under `content/<dir>/SKILL.md` relative to this module, which the
 * build step mirrors into `build/skills/content/` (see package.json build), so
 * the same relative path resolves in both tsx-dev and compiled runs.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTENT_DIR = path.resolve(__dirname, 'content');
const cache = new Map<string, string>();

/**
 * Load a skill's markdown by its content-relative path
 * (e.g. `'affise-affiliate-manager/SKILL.md'`) and cache the result.
 */
export function loadSkill(file: string): string {
  const cached = cache.get(file);
  if (cached) return cached;
  const raw = readFileSync(path.join(CONTENT_DIR, file), 'utf8');
  cache.set(file, raw);
  return raw;
}

/**
 * Registry of skill resources the server publishes. Each entry is served at
 * its `skill://` URI via `resources/read`; skill-aware clients pick them up
 * from `resources/list`. Keep the `uri` slugs stable — clients key on them.
 */
export const SKILL_RESOURCES = {
  affiliateManager: {
    uri: 'skill://affise/affiliate-manager',
    file: 'affise-affiliate-manager/SKILL.md',
    title: 'Affise Affiliate Manager',
  },
  advertiserManager: {
    uri: 'skill://affise/advertiser-manager',
    file: 'affise-advertiser-manager/SKILL.md',
    title: 'Affise Advertiser Manager',
  },
  affiliatePublisher: {
    uri: 'skill://affise/affiliate-publisher',
    file: 'affise-affiliate-publisher/SKILL.md',
    title: 'Affise Affiliate / Publisher',
  },
  businessOwner: {
    uri: 'skill://affise/business-owner',
    file: 'affise-business-owner/SKILL.md',
    title: 'Affise Business Owner',
  },
} as const;

export type SkillKey = keyof typeof SKILL_RESOURCES;
