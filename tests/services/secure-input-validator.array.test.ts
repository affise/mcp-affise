/**
 * Tests for SecureInputValidator array handling — regressions for the bug
 * where validateObject() recursively dispatched arrays as 'object' (because
 * typeof [] === 'object'), producing the user-visible "params.slice must be
 * an object" error on valid array inputs.
 *
 * Also covers numeric-keyed object coercion inside validateArray() so that
 * { 0: "a", 1: "b" } shaped inputs (from quirky JSON-RPC encoders) are
 * accepted instead of being rejected as not-an-array.
 */

import { SecureInputValidator } from '../../src/services/secure-input-validator.js';

describe('SecureInputValidator — array handling inside objects', () => {
  it('accepts array-valued properties of a top-level object', () => {
    const result = SecureInputValidator.validateAndSanitize(
      { slice: ['day', 'country'], fields: ['clicks'] },
      'params',
      'object'
    );
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.sanitizedValue.slice).toEqual(['day', 'country']);
    expect(result.sanitizedValue.fields).toEqual(['clicks']);
  });

  it('accepts arrays nested inside a nested object (filter.partner)', () => {
    const result = SecureInputValidator.validateAndSanitize(
      { filter: { partner: ['193'], os: ['Unknown'] } },
      'params',
      'object'
    );
    expect(result.isValid).toBe(true);
    expect(result.sanitizedValue.filter.partner).toEqual(['193']);
    expect(result.sanitizedValue.filter.os).toEqual(['Unknown']);
  });

  it('does NOT regress to the old "params.slice must be an object" error', () => {
    const result = SecureInputValidator.validateAndSanitize(
      { slice: ['day'] },
      'params',
      'object'
    );
    expect(result.errors.join(' ')).not.toMatch(/must be an object/);
    expect(result.isValid).toBe(true);
  });
});

describe('SecureInputValidator — array coercion from numeric-keyed objects', () => {
  it('coerces { 0: "a", 1: "b" } into ["a", "b"] when validated as array', () => {
    const result = SecureInputValidator.validateAndSanitize(
      { 0: 'day', 1: 'country' },
      'slice',
      'array'
    );
    expect(result.isValid).toBe(true);
    expect(result.sanitizedValue).toEqual(['day', 'country']);
  });

  it('coerces numeric-keyed objects even when keys are out of order', () => {
    const result = SecureInputValidator.validateAndSanitize(
      { 2: 'c', 0: 'a', 1: 'b' },
      'slice',
      'array'
    );
    expect(result.isValid).toBe(true);
    expect(result.sanitizedValue).toEqual(['a', 'b', 'c']);
  });

  it('lets numeric-keyed object inside a parent object pass validation (downstream normalize() coerces it)', () => {
    // Inside validateObject, a property value with typeof === 'object' is
    // routed through validateObject again (not validateArray) because it's not
    // an Array. That's fine — validateObject doesn't reject it, so the request
    // proceeds. The actual array recovery happens in normalizeStatsParams,
    // which is a separate concern. This test pins down the contract.
    const result = SecureInputValidator.validateAndSanitize(
      { slice: { 0: 'day', 1: 'country' } },
      'params',
      'object'
    );
    expect(result.isValid).toBe(true);
  });

  it('still rejects objects with non-numeric keys when validating as array', () => {
    const result = SecureInputValidator.validateAndSanitize(
      { key1: 'a', key2: 'b' },
      'slice',
      'array'
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/must be an array/);
  });

  it('rejects mixed numeric/non-numeric keys', () => {
    const result = SecureInputValidator.validateAndSanitize(
      { 0: 'a', key1: 'b' },
      'slice',
      'array'
    );
    expect(result.isValid).toBe(false);
  });
});
