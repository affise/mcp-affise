/**
 * Unit tests for deriveRole() — the discriminator behind startup-time
 * tools/list filtering.
 *
 * An explicit whitelist over the full Affise user.type vocabulary,
 * rather than a binary {partner|admin} mapping. Unknown values fall
 * through to 'unknown' instead of being silently bucketed as 'admin'.
 *
 * Real values observed against a live tenant:
 *   admin   key → user.type = "common_manager"
 *   partner key → user.type = "affiliate"
 */

import { describe, it, expect } from 'vitest';
import { deriveRole } from '../../src/services/affise-client.js';

describe('deriveRole', () => {
  it('maps "affiliate" → partner (real value from a partner key)', () => {
    expect(deriveRole('affiliate')).toBe('partner');
  });

  it('maps "advertiser" → advertiser (its own role, NOT admin)', () => {
    // Currently no advertiser-specific
    // tools in the catalogue → an advertiser session sees only affise_status
    // (the 'any'-role tool), which is correct fail-closed behaviour.
    expect(deriveRole('advertiser')).toBe('advertiser');
  });

  it('maps all admin-side manager types → admin', () => {
    expect(deriveRole('common_manager')).toBe('admin');     // real value
    expect(deriveRole('affiliate_manager')).toBe('admin');
    expect(deriveRole('account_manager')).toBe('admin');
    expect(deriveRole('client')).toBe('admin');             // tenant owner
    expect(deriveRole('root')).toBe('admin');               // super-admin
  });

  it('returns unknown for missing/empty type', () => {
    expect(deriveRole(undefined)).toBe('unknown');
    expect(deriveRole('')).toBe('unknown');
  });

  it('returns unknown for unrecognized type (no silent admin bucketing)', () => {
    // Future-proofing: if Affise adds a new user type — e.g. auditor,
    // billing — we want auto-detect to fall back to "unknown" → no
    // filter → all 23 tools register. Better than silently classifying as
    // admin and exposing tools the new role might not be able to call.
    expect(deriveRole('auditor')).toBe('unknown');
    expect(deriveRole('billing_only')).toBe('unknown');
    expect(deriveRole('some_future_role')).toBe('unknown');
  });

  it('is case-sensitive — Affise emits lower-case, so we do too', () => {
    // If Affise ever changes casing, we fall through to 'unknown' rather
    // than mis-classify. Conservative default.
    expect(deriveRole('Affiliate')).toBe('unknown');
    expect(deriveRole('AFFILIATE')).toBe('unknown');
    expect(deriveRole('Advertiser')).toBe('unknown');
    expect(deriveRole('Common_Manager')).toBe('unknown');
  });
});
