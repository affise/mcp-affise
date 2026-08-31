/**
 * Register client-facing skill markdown as MCP resources on an
 * {@link McpServer} instance.
 *
 * One `registerResource` call per entry in {@link SKILL_RESOURCES}, served as
 * `text/markdown` at the entry's `skill://` URI. Skill-aware hosts discover
 * these via `resources/list` and load the body on demand (progressive
 * disclosure); other clients simply ignore them.
 *
 * Runs once per McpServer lifecycle — at stdio startup, from index.ts.
 */

import type { McpServer } from '../mcp-sdk.js';
import { loadSkill, SKILL_RESOURCES } from './loader.js';

const SKILL_MIME_TYPE = 'text/markdown';

/**
 * Convert a camelCase SKILL_RESOURCES key into the kebab-case display id the
 * SDK expects.
 */
function skillIdFromKey(key: string): string {
  return `skill-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
}

export function setupSkillResources(mcpServer: McpServer): void {
  for (const [key, skill] of Object.entries(SKILL_RESOURCES)) {
    mcpServer.registerResource(
      skillIdFromKey(key),
      skill.uri,
      {
        title: skill.title,
        mimeType: SKILL_MIME_TYPE,
      },
      async () => ({
        contents: [
          {
            uri: skill.uri,
            mimeType: SKILL_MIME_TYPE,
            text: loadSkill(skill.file),
          },
        ],
      }),
    );
  }
}
