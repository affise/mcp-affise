/**
 * Secure Input Validator - Comprehensive input validation with security focus
 * Protects against injection attacks, XSS, and malicious inputs
 */

import { SecurityAuditLogger } from '../utils/security-utils.js';

export interface SecureValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedValue?: any;
  threatLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  attackVectors: string[];
}

export class SecureInputValidator {
  private static readonly MAX_STRING_LENGTH = 1000;
  private static readonly MAX_ARRAY_LENGTH = 50;
  private static readonly MAX_NESTING_DEPTH = 3;

  /**
   * Comprehensive input validation with security checks
   */
  static validateAndSanitize(
    input: any, 
    fieldName: string, 
    expectedType: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date'
  ): SecureValidationResult {
    const result: SecureValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      threatLevel: 'none',
      attackVectors: []
    };

    // Check for null/undefined
    if (input == null) {
      if (expectedType !== 'object') {
        result.errors.push(`${fieldName} is required`);
        result.isValid = false;
      }
      return result;
    }

    // Check for prototype pollution
    this.checkPrototypePollution(input, result, fieldName);

    switch (expectedType) {
      case 'string':
        this.validateString(input, fieldName, result);
        break;
      case 'number':
        this.validateNumber(input, fieldName, result);
        break;
      case 'boolean':
        this.validateBoolean(input, fieldName, result);
        break;
      case 'array':
        this.validateArray(input, fieldName, result);
        break;
      case 'object':
        this.validateObject(input, fieldName, result);
        break;
      case 'date':
        this.validateDate(input, fieldName, result);
        break;
      default:
        result.errors.push(`Unknown expected type: ${expectedType}`);
        result.isValid = false;
    }

    // Log security violations
    if (result.attackVectors.length > 0) {
      SecurityAuditLogger.logSecurityViolation(
        `Input validation detected potential attack in ${fieldName}`,
        { 
          field: fieldName, 
          attackVectors: result.attackVectors,
          threatLevel: result.threatLevel 
        }
      );
    }

    return result;
  }

  /**
   * Validate and sanitize string inputs
   */
  private static validateString(input: any, fieldName: string, result: SecureValidationResult): void {
    if (typeof input !== 'string') {
      result.errors.push(`${fieldName} must be a string`);
      result.isValid = false;
      return;
    }

    // Length validation
    if (input.length === 0) {
      result.errors.push(`${fieldName} cannot be empty`);
      result.isValid = false;
      return;
    }

    if (input.length > this.MAX_STRING_LENGTH) {
      result.errors.push(`${fieldName} is too long (max ${this.MAX_STRING_LENGTH} characters)`);
      result.isValid = false;
      return;
    }

    // Security checks
    const securityResult = this.performSecurityChecks(input);
    result.attackVectors.push(...securityResult.attackVectors);
    result.threatLevel = this.getMaxThreatLevel(result.threatLevel, securityResult.threatLevel);

    if (securityResult.isMalicious) {
      result.errors.push(`${fieldName} contains potentially malicious content`);
      result.isValid = false;
      return;
    }

    // Sanitize the string
    result.sanitizedValue = this.sanitizeString(input);
    
    // Check if sanitization changed the input significantly
    if (result.sanitizedValue !== input) {
      const changePercent = ((input.length - result.sanitizedValue.length) / input.length) * 100;
      if (changePercent > 20) {
        result.warnings.push(`${fieldName} was heavily sanitized (${Math.round(changePercent)}% changed)`);
        result.threatLevel = this.getMaxThreatLevel(result.threatLevel, 'medium');
      }
    }
  }

  /**
   * Validate number inputs
   */
  private static validateNumber(input: any, fieldName: string, result: SecureValidationResult): void {
    if (typeof input === 'string') {
      // Try to parse string numbers
      const parsed = Number(input);
      if (isNaN(parsed)) {
        result.errors.push(`${fieldName} must be a valid number`);
        result.isValid = false;
        return;
      }
      result.sanitizedValue = parsed;
    } else if (typeof input !== 'number') {
      result.errors.push(`${fieldName} must be a number`);
      result.isValid = false;
      return;
    } else {
      result.sanitizedValue = input;
    }

    // Check for unsafe numbers
    if (!Number.isFinite(result.sanitizedValue)) {
      result.errors.push(`${fieldName} must be a finite number`);
      result.isValid = false;
      return;
    }

    // Check for extremely large numbers (potential DoS)
    if (Math.abs(result.sanitizedValue) > Number.MAX_SAFE_INTEGER) {
      result.errors.push(`${fieldName} is too large`);
      result.threatLevel = 'medium';
      result.attackVectors.push('large_number_attack');
      result.isValid = false;
      return;
    }
  }

  /**
   * Validate boolean inputs
   */
  private static validateBoolean(input: any, fieldName: string, result: SecureValidationResult): void {
    if (typeof input === 'boolean') {
      result.sanitizedValue = input;
    } else if (typeof input === 'string') {
      const lowercased = input.toLowerCase();
      if (lowercased === 'true' || lowercased === '1') {
        result.sanitizedValue = true;
      } else if (lowercased === 'false' || lowercased === '0') {
        result.sanitizedValue = false;
      } else {
        result.errors.push(`${fieldName} must be a boolean (true/false)`);
        result.isValid = false;
        return;
      }
    } else {
      result.errors.push(`${fieldName} must be a boolean`);
      result.isValid = false;
      return;
    }
  }

  /**
   * Validate array inputs
   */
  private static validateArray(input: any, fieldName: string, result: SecureValidationResult): void {
    if (!Array.isArray(input)) {
      result.errors.push(`${fieldName} must be an array`);
      result.isValid = false;
      return;
    }

    if (input.length > this.MAX_ARRAY_LENGTH) {
      result.errors.push(`${fieldName} array is too large (max ${this.MAX_ARRAY_LENGTH} items)`);
      result.threatLevel = 'medium';
      result.attackVectors.push('large_array_attack');
      result.isValid = false;
      return;
    }

    // Sanitize array elements
    const sanitizedArray: any[] = [];
    for (let i = 0; i < input.length; i++) {
      const element = input[i];
      
      if (typeof element === 'string') {
        const elementResult = this.performSecurityChecks(element);
        result.attackVectors.push(...elementResult.attackVectors);
        result.threatLevel = this.getMaxThreatLevel(result.threatLevel, elementResult.threatLevel);
        
        if (elementResult.isMalicious) {
          result.errors.push(`${fieldName}[${i}] contains potentially malicious content`);
          result.isValid = false;
          return;
        }
        
        sanitizedArray.push(this.sanitizeString(element));
      } else if (typeof element === 'number' || typeof element === 'boolean') {
        sanitizedArray.push(element);
      } else {
        result.errors.push(`${fieldName}[${i}] must be a string, number, or boolean`);
        result.isValid = false;
        return;
      }
    }

    result.sanitizedValue = sanitizedArray;
  }

  /**
   * Validate object inputs with depth protection
   */
  private static validateObject(input: any, fieldName: string, result: SecureValidationResult, depth: number = 0): void {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      result.errors.push(`${fieldName} must be an object`);
      result.isValid = false;
      return;
    }

    // Check nesting depth to prevent DoS
    if (depth > this.MAX_NESTING_DEPTH) {
      result.errors.push(`${fieldName} object is too deeply nested`);
      result.threatLevel = 'high';
      result.attackVectors.push('deep_nesting_attack');
      result.isValid = false;
      return;
    }

    // Check object size
    const keys = Object.keys(input);
    if (keys.length > 100) {
      result.errors.push(`${fieldName} object has too many properties (max 100)`);
      result.threatLevel = 'medium';
      result.attackVectors.push('large_object_attack');
      result.isValid = false;
      return;
    }

    // Sanitize object properties
    const sanitizedObject: any = {};
    
    for (const key of keys) {
      // Validate key name
      if (!this.isValidPropertyName(key)) {
        result.errors.push(`${fieldName} has invalid property name: ${key}`);
        result.threatLevel = 'high';
        result.attackVectors.push('malicious_property_name');
        result.isValid = false;
        return;
      }

      const value = input[key];
      
      if (typeof value === 'string') {
        const securityResult = this.performSecurityChecks(value);
        result.attackVectors.push(...securityResult.attackVectors);
        result.threatLevel = this.getMaxThreatLevel(result.threatLevel, securityResult.threatLevel);
        
        if (securityResult.isMalicious) {
          result.errors.push(`${fieldName}.${key} contains potentially malicious content`);
          result.isValid = false;
          return;
        }
        
        sanitizedObject[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively validate nested objects
        const nestedResult = this.validateAndSanitize(value, `${fieldName}.${key}`, 'object');
        if (!nestedResult.isValid) {
          result.errors.push(...nestedResult.errors);
          result.isValid = false;
          return;
        }
        sanitizedObject[key] = nestedResult.sanitizedValue;
      } else {
        sanitizedObject[key] = value;
      }
    }

    result.sanitizedValue = sanitizedObject;
  }

  /**
   * Validate date inputs
   */
  private static validateDate(input: any, fieldName: string, result: SecureValidationResult): void {
    if (typeof input !== 'string') {
      result.errors.push(`${fieldName} must be a date string`);
      result.isValid = false;
      return;
    }

    // Check for injection in date string
    const securityResult = this.performSecurityChecks(input);
    result.attackVectors.push(...securityResult.attackVectors);
    result.threatLevel = this.getMaxThreatLevel(result.threatLevel, securityResult.threatLevel);

    if (securityResult.isMalicious) {
      result.errors.push(`${fieldName} contains potentially malicious content`);
      result.isValid = false;
      return;
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(input)) {
      result.errors.push(`${fieldName} must be in YYYY-MM-DD format`);
      result.isValid = false;
      return;
    }

    // Validate date is parseable
    const parsedDate = new Date(input);
    if (isNaN(parsedDate.getTime())) {
      result.errors.push(`${fieldName} is not a valid date`);
      result.isValid = false;
      return;
    }

    // Check date range (prevent extremely old/future dates)
    const currentYear = new Date().getFullYear();
    if (parsedDate.getFullYear() < 1900 || parsedDate.getFullYear() > currentYear + 10) {
      result.errors.push(`${fieldName} must be between 1900 and ${currentYear + 10}`);
      result.isValid = false;
      return;
    }

    result.sanitizedValue = input;
  }

  /**
   * Perform security checks on string input
   */
  private static performSecurityChecks(input: string): {
    isMalicious: boolean;
    threatLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
    attackVectors: string[];
  } {
    const result = {
      isMalicious: false,
      threatLevel: 'none' as 'none' | 'low' | 'medium' | 'high' | 'critical',
      attackVectors: [] as string[]
    };

    // SQL Injection patterns (more specific to reduce false positives)
    const sqlPatterns = [
      /(';\s*(DROP|DELETE|UPDATE|INSERT|TRUNCATE))/gi,
      /\b(UNION\s+SELECT\s+.*)/gi,
      /\b(SELECT\s+.*\s+FROM\s+.*)/gi,
      /\b(INSERT\s+INTO\s+.*VALUES)/gi,
      /\b(UPDATE\s+.*\s+SET\s+.*)/gi,
      /\b(DELETE\s+FROM\s+.*WHERE)/gi,
      /\b(DROP\s+(TABLE|DATABASE|VIEW|INDEX))/gi,
      /\b(EXEC|EXECUTE)\s+(@\w+|'\w+')/gi
    ];

    // XSS patterns
    const xssPatterns = [
      /<script[\s\S]*?<\/script>/gi,
      /<iframe[\s\S]*?<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<img[\s\S]*?onerror/gi,
      /<svg[\s\S]*?onload/gi
    ];

    // Command injection patterns (more targeted)
    const commandPatterns = [
      /(&&|\|\||;\s*\w|`\w+`)/g, // More specific command chaining/execution
      /\b(wget|curl|nc|netcat|bash|sh|cmd|powershell)\b/gi,
      /\$\(|\${/g, // Command substitution
      /\b(rm\s+-rf|del\s+\/|format\s+c:)/gi
    ];

    // Path traversal patterns
    const pathTraversalPatterns = [
      /\.\.[\/\\]/g,
      /(\/etc\/passwd|\/etc\/shadow|\.\.\/\.\.\/)/gi,
      /[a-zA-Z]:[\/\\]/g // Windows paths
    ];

    // Check SQL injection
    if (sqlPatterns.some(pattern => pattern.test(input))) {
      result.attackVectors.push('sql_injection');
      result.threatLevel = this.getMaxThreatLevel(result.threatLevel, 'critical');
      result.isMalicious = true;
    }

    // Check XSS
    if (xssPatterns.some(pattern => pattern.test(input))) {
      result.attackVectors.push('xss_attempt');
      result.threatLevel = this.getMaxThreatLevel(result.threatLevel, 'high');
      result.isMalicious = true;
    }

    // Check command injection
    if (commandPatterns.some(pattern => pattern.test(input))) {
      result.attackVectors.push('command_injection');
      result.threatLevel = this.getMaxThreatLevel(result.threatLevel, 'critical');
      result.isMalicious = true;
    }

    // Check path traversal
    if (pathTraversalPatterns.some(pattern => pattern.test(input))) {
      result.attackVectors.push('path_traversal');
      result.threatLevel = this.getMaxThreatLevel(result.threatLevel, 'high');
      result.isMalicious = true;
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /%[0-9a-fA-F]{2}/g, // URL encoding
      /\\x[0-9a-fA-F]{2}/g, // Hex encoding
      /&#x?[0-9a-fA-F]+;/g, // HTML entities
      /eval\s*\(|Function\s*\(/gi, // Code execution
      /(document\.cookie|localStorage|sessionStorage)/gi // Browser API access
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(input))) {
      result.attackVectors.push('suspicious_encoding');
      result.threatLevel = this.getMaxThreatLevel(result.threatLevel, 'medium');
      
      // Not automatically malicious, but suspicious
      if (result.threatLevel === 'medium' && result.attackVectors.length === 1) {
        result.isMalicious = false; // Allow but warn
      }
    }

    return result;
  }

  /**
   * Sanitize string input
   */
  private static sanitizeString(input: string): string {
    return input
      // Remove null bytes
      .replace(/\0/g, '')
      // Remove control characters except newlines and tabs
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Normalize Unicode
      .normalize('NFKC')
      // Trim whitespace
      .trim();
  }

  /**
   * Check for prototype pollution
   */
  private static checkPrototypePollution(input: any, result: SecureValidationResult, fieldName: string): void {
    if (typeof input === 'object' && input !== null) {
      const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
      
      const checkKeys = (obj: any, path: string = '') => {
        if (typeof obj !== 'object' || obj === null) return;
        
        for (const key of Object.keys(obj)) {
          const fullPath = path ? `${path}.${key}` : key;
          
          if (dangerousKeys.includes(key)) {
            result.errors.push(`${fieldName} contains dangerous property: ${fullPath}`);
            result.threatLevel = 'critical';
            result.attackVectors.push('prototype_pollution');
            result.isValid = false;
            return;
          }
          
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            checkKeys(obj[key], fullPath);
          }
        }
      };
      
      checkKeys(input);
    }
  }

  /**
   * Check if property name is valid
   */
  private static isValidPropertyName(name: string): boolean {
    // Block dangerous property names
    const blockedNames = [
      '__proto__', 'constructor', 'prototype', 'eval', 'Function',
      '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'
    ];
    
    if (blockedNames.includes(name)) {
      return false;
    }
    
    // Only allow alphanumeric, underscore, dash, dot
    return /^[a-zA-Z0-9_.-]+$/.test(name) && name.length <= 100;
  }

  /**
   * Get the maximum threat level
   */
  private static getMaxThreatLevel(
    current: 'none' | 'low' | 'medium' | 'high' | 'critical',
    new_level: 'none' | 'low' | 'medium' | 'high' | 'critical'
  ): 'none' | 'low' | 'medium' | 'high' | 'critical' {
    const levels = ['none', 'low', 'medium', 'high', 'critical'];
    const currentIndex = levels.indexOf(current);
    const newIndex = levels.indexOf(new_level);
    return levels[Math.max(currentIndex, newIndex)] as any;
  }
}