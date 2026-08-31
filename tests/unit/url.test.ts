import { describe, it, expect } from 'vitest';
import { normalizeBaseUrl } from '../../src/utils/url.js';

describe('normalizeBaseUrl', () => {
  it('strips a single trailing slash', () => {
    expect(normalizeBaseUrl('https://api-company.affise.com/')).toBe('https://api-company.affise.com');
  });

  it('strips multiple trailing slashes', () => {
    expect(normalizeBaseUrl('https://api.affise.com///')).toBe('https://api.affise.com');
  });

  it('leaves a clean URL untouched', () => {
    expect(normalizeBaseUrl('https://api.affise.com')).toBe('https://api.affise.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeBaseUrl('  https://api.affise.com/  ')).toBe('https://api.affise.com');
  });

  it('does not touch a non-trailing slash in the path', () => {
    expect(normalizeBaseUrl('https://api.affise.com/v3')).toBe('https://api.affise.com/v3');
  });

  it('returns empty string for falsy input', () => {
    expect(normalizeBaseUrl('')).toBe('');
    expect(normalizeBaseUrl(undefined)).toBe('');
    expect(normalizeBaseUrl(null)).toBe('');
  });
});
