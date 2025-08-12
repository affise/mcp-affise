/**
 * Validation Service - Input validation and parameter normalization
 */

import { getDateRange } from '../shared/date-utils.js';
import { SecureInputValidator, type SecureValidationResult } from './secure-input-validator.js';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export class ValidationService {
  /**
   * Validate offer search parameters with security checks
   */
  validateOfferSearch(params: { query?: string }): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Use secure validation
    const secureResult = SecureInputValidator.validateAndSanitize(
      params.query, 
      'query', 
      'string'
    );

    if (!secureResult.isValid) {
      errors.push(...secureResult.errors);
    }

    if (secureResult.warnings) {
      warnings.push(...secureResult.warnings);
    }

    // Update the original params with sanitized value if validation passed
    if (secureResult.isValid && secureResult.sanitizedValue !== undefined) {
      params.query = secureResult.sanitizedValue;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate smart search parameters with security checks
   */
  validateSmartSearch(params: {
    query?: string;
    categories?: string[];
    countries?: string[];
  }): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate query with security checks
    const queryResult = SecureInputValidator.validateAndSanitize(
      params.query, 
      'query', 
      'string'
    );

    if (!queryResult.isValid) {
      errors.push(...queryResult.errors);
    } else if (queryResult.sanitizedValue !== undefined) {
      params.query = queryResult.sanitizedValue;
    }

    if (queryResult.warnings) {
      warnings.push(...queryResult.warnings);
    }

    // Validate categories array with security checks
    if (params.categories !== undefined) {
      const categoriesResult = SecureInputValidator.validateAndSanitize(
        params.categories,
        'categories',
        'array'
      );

      if (!categoriesResult.isValid) {
        errors.push(...categoriesResult.errors);
      } else if (categoriesResult.sanitizedValue !== undefined) {
        params.categories = categoriesResult.sanitizedValue;
      }

      if (categoriesResult.warnings) {
        warnings.push(...categoriesResult.warnings);
      }
    }

    // Validate countries array with security checks
    if (params.countries !== undefined) {
      const countriesResult = SecureInputValidator.validateAndSanitize(
        params.countries,
        'countries',
        'array'
      );

      if (!countriesResult.isValid) {
        errors.push(...countriesResult.errors);
      } else if (countriesResult.sanitizedValue !== undefined) {
        // Additional validation for country codes
        const validCountries = (countriesResult.sanitizedValue as string[]).filter((c: string) => 
          typeof c === 'string' && this.isValidCountryCode(c.toUpperCase())
        );
        
        if (validCountries.length !== countriesResult.sanitizedValue.length) {
          const invalidCount = countriesResult.sanitizedValue.length - validCountries.length;
          warnings.push(`${invalidCount} invalid country codes removed`);
        }
        
        params.countries = validCountries.map(c => c.toUpperCase());
      }

      if (countriesResult.warnings) {
        warnings.push(...countriesResult.warnings);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate stats query parameters with security checks
   */
  validateStatsQuery(params: { query?: string }): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Use secure validation for stats query
    const secureResult = SecureInputValidator.validateAndSanitize(
      params.query,
      'query',
      'string'
    );

    if (!secureResult.isValid) {
      errors.push(...secureResult.errors);
    }

    if (secureResult.warnings) {
      warnings.push(...secureResult.warnings);
    }

    // Update params with sanitized value
    if (secureResult.isValid && secureResult.sanitizedValue !== undefined) {
      params.query = secureResult.sanitizedValue;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate raw stats parameters with security checks
   */
  validateRawStatsParams(params: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // First, perform comprehensive security validation on the entire object
    const objectResult = SecureInputValidator.validateAndSanitize(
      params,
      'params',
      'object'
    );

    if (!objectResult.isValid) {
      errors.push(...objectResult.errors);
    }

    if (objectResult.warnings) {
      warnings.push(...objectResult.warnings);
    }

    // Use sanitized values for further validation
    const sanitizedParams = objectResult.sanitizedValue || params;

    // Validate date parameters with security checks
    if (sanitizedParams.date_from !== undefined) {
      const dateFromResult = SecureInputValidator.validateAndSanitize(
        sanitizedParams.date_from,
        'date_from',
        'date'
      );

      if (!dateFromResult.isValid) {
        errors.push(...dateFromResult.errors);
      } else if (!this.isValidDate(dateFromResult.sanitizedValue)) {
        errors.push('Invalid date_from format (use YYYY-MM-DD)');
      } else {
        sanitizedParams.date_from = dateFromResult.sanitizedValue;
      }

      if (dateFromResult.warnings) {
        warnings.push(...dateFromResult.warnings);
      }
    }

    if (sanitizedParams.date_to !== undefined) {
      const dateToResult = SecureInputValidator.validateAndSanitize(
        sanitizedParams.date_to,
        'date_to',
        'date'
      );

      if (!dateToResult.isValid) {
        errors.push(...dateToResult.errors);
      } else if (!this.isValidDate(dateToResult.sanitizedValue)) {
        errors.push('Invalid date_to format (use YYYY-MM-DD)');
      } else {
        sanitizedParams.date_to = dateToResult.sanitizedValue;
      }

      if (dateToResult.warnings) {
        warnings.push(...dateToResult.warnings);
      }
    }

    // Validate date range
    if (sanitizedParams.date_from && sanitizedParams.date_to && 
        typeof sanitizedParams.date_from === 'string' && typeof sanitizedParams.date_to === 'string') {
      if (new Date(sanitizedParams.date_from) > new Date(sanitizedParams.date_to)) {
        errors.push('date_from must be before date_to');
      }
    }

    // Validate period with security checks
    if (sanitizedParams.period !== undefined) {
      const periodResult = SecureInputValidator.validateAndSanitize(
        sanitizedParams.period,
        'period',
        'string'
      );

      if (!periodResult.isValid) {
        errors.push(...periodResult.errors);
      } else if (!this.isValidPeriod(periodResult.sanitizedValue)) {
        errors.push('Invalid period format');
      } else {
        sanitizedParams.period = periodResult.sanitizedValue;
      }

      if (periodResult.warnings) {
        warnings.push(...periodResult.warnings);
      }
    }

    // Validate slice array with security checks
    if (sanitizedParams.slice !== undefined) {
      const sliceResult = SecureInputValidator.validateAndSanitize(
        sanitizedParams.slice,
        'slice',
        'array'
      );

      if (!sliceResult.isValid) {
        errors.push(...sliceResult.errors);
      } else {
        const sanitizedSlice = sliceResult.sanitizedValue as string[];
        const invalidSlices = sanitizedSlice.filter((s: string) => !this.isValidSlice(s));
        if (invalidSlices.length > 0) {
          errors.push(`Invalid slice values: ${invalidSlices.join(', ')}`);
        } else {
          sanitizedParams.slice = sanitizedSlice;
        }
      }

      if (sliceResult.warnings) {
        warnings.push(...sliceResult.warnings);
      }
    }

    // Validate fields array with security checks
    if (sanitizedParams.fields !== undefined) {
      const fieldsResult = SecureInputValidator.validateAndSanitize(
        sanitizedParams.fields,
        'fields',
        'array'
      );

      if (!fieldsResult.isValid) {
        errors.push(...fieldsResult.errors);
      } else {
        const sanitizedFields = fieldsResult.sanitizedValue as string[];
        const invalidFields = sanitizedFields.filter((f: string) => !this.isValidField(f));
        if (invalidFields.length > 0) {
          errors.push(`Invalid field values: ${invalidFields.join(', ')}`);
        } else {
          sanitizedParams.fields = sanitizedFields;
        }
      }

      if (fieldsResult.warnings) {
        warnings.push(...fieldsResult.warnings);
      }
    }

    // Validate order with security checks
    if (sanitizedParams.order !== undefined) {
      // Handle string to array conversion
      let orderValue = sanitizedParams.order;
      if (typeof orderValue === 'string') {
        orderValue = [orderValue];
      }

      const orderResult = SecureInputValidator.validateAndSanitize(
        orderValue,
        'order',
        'array'
      );

      if (!orderResult.isValid) {
        errors.push(...orderResult.errors);
      } else {
        const sanitizedOrder = orderResult.sanitizedValue as string[];
        const invalidOrders = sanitizedOrder.filter((o: string) => !this.isValidOrderField(o));
        if (invalidOrders.length > 0) {
          errors.push(`Invalid order fields: ${invalidOrders.join(', ')}`);
        } else {
          sanitizedParams.order = sanitizedOrder;
        }
      }

      if (orderResult.warnings) {
        warnings.push(...orderResult.warnings);
      }
    }

    // Validate pagination with security checks
    if (sanitizedParams.page !== undefined) {
      const pageResult = SecureInputValidator.validateAndSanitize(
        sanitizedParams.page,
        'page',
        'number'
      );

      if (!pageResult.isValid) {
        errors.push(...pageResult.errors);
      } else {
        const pageNum = pageResult.sanitizedValue as number;
        if (!Number.isInteger(pageNum) || pageNum < 1) {
          errors.push('Page must be a positive integer');
        } else {
          sanitizedParams.page = pageNum;
        }
      }

      if (pageResult.warnings) {
        warnings.push(...pageResult.warnings);
      }
    }

    if (sanitizedParams.limit !== undefined) {
      const limitResult = SecureInputValidator.validateAndSanitize(
        sanitizedParams.limit,
        'limit',
        'number'
      );

      if (!limitResult.isValid) {
        errors.push(...limitResult.errors);
      } else {
        const limitNum = limitResult.sanitizedValue as number;
        if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 500) {
          errors.push('Limit must be an integer between 1 and 500');
        } else {
          sanitizedParams.limit = limitNum;
        }
      }

      if (limitResult.warnings) {
        warnings.push(...limitResult.warnings);
      }
    }

    // Update the original params with sanitized values
    if (objectResult.isValid && errors.length === 0) {
      Object.assign(params, sanitizedParams);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Normalize stats parameters
   */
  normalizeStatsParams(params: Record<string, unknown>): Record<string, unknown> {
    const normalized = { ...params };

    // Handle date range
    if (normalized.period && typeof normalized.period === 'string') {
      const dateRange = getDateRange(normalized.period as any);
      normalized.date_from = dateRange.from;
      normalized.date_to = dateRange.to;
      delete normalized.period;
    } else if (!normalized.date_from || !normalized.date_to) {
      const dateRange = getDateRange('last7days');
      normalized.date_from = dateRange.from;
      normalized.date_to = dateRange.to;
    }

    // Set defaults
    if (!normalized.slice) {
      normalized.slice = ['day'];
    }

    if (!normalized.fields) {
      normalized.fields = ['clicks', 'conversions', 'income', 'cr'];
    }

    // Normalize order field
    if (normalized.order) {
      if (typeof normalized.order === 'string') {
        normalized.order = [normalized.order];
      }
      
      // Map field aliases
      const fieldMapping: Record<string, string> = {
        'income': 'total_revenue',
        'earnings': 'confirmed_earning',
        'conversions': 'confirmed_count',
        'clicks': 'raw'
      };
      
      normalized.order = (normalized.order as string[]).map((field: string) => fieldMapping[field] || field);
    }

    // Set pagination defaults
    if (!normalized.page) {
      normalized.page = 1;
    }

    if (!normalized.limit) {
      normalized.limit = 100;
    }

    return normalized;
  }

  /**
   * Validate date format (YYYY-MM-DD)
   */
  private isValidDate(date: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(date)) {
      return false;
    }
    
    const parsedDate = new Date(date);
    return parsedDate.toISOString().startsWith(date);
  }

  /**
   * Validate period format
   */
  private isValidPeriod(period: string): boolean {
    const validPeriods = [
      'today', 'yesterday', 'last7days', 'last30days', 'last90days',
      'thisweek', 'lastweek', 'thismonth', 'lastmonth', 'thisyear', 'lastyear'
    ];
    
    return validPeriods.includes(period);
  }

  /**
   * Validate slice values
   */
  private isValidSlice(slice: string): boolean {
    const validSlices = [
      'day', 'hour', 'month', 'quarter', 'year',
      'country', 'city', 'os', 'os_version', 'device', 'device_model',
      'browser', 'offer', 'advertiser', 'affiliate', 'goal',
      'sub1', 'sub2', 'sub3', 'sub4', 'sub5'
    ];
    
    return validSlices.includes(slice);
  }

  /**
   * Validate field values
   */
  private isValidField(field: string): boolean {
    const validFields = [
      'clicks', 'conversions', 'income', 'cr', 'epc', 'cpc',
      'raw', 'uniq', 'confirmed_count', 'confirmed_earning',
      'pending_count', 'pending_earning', 'declined_count', 'declined_earning',
      'total_count', 'total_revenue', 'impressions', 'ctr'
    ];
    
    return validFields.includes(field);
  }

  /**
   * Validate order field values
   */
  private isValidOrderField(field: string): boolean {
    const validOrderFields = [
      'hour', 'month', 'quarter', 'year', 'day', 'currency', 'offer', 'country', 'city',
      'os', 'os_version', 'device', 'device_model', 'browser', 'goal',
      'sub1', 'sub2', 'sub3', 'sub4', 'sub5',
      'confirmed_earning', 'raw', 'uniq', 'total_count', 'total_revenue',
      'pending_count', 'pending_revenue', 'declined_count', 'declined_revenue',
      'hold_count', 'hold_revenue', 'confirmed_count', 'confirmed_revenue',
      'advertiser', 'affiliate', 'manager'
    ];
    
    return validOrderFields.includes(field);
  }

  /**
   * Validate country code (2-letter ISO format)
   */
  private isValidCountryCode(code: string): boolean {
    return /^[A-Z]{2}$/.test(code);
  }
}
