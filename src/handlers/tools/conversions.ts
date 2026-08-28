/**
 * Handlers for conversion-level tools:
 *   affise_conversions_raw — /3.0/stats/conversions (listing)
 *   affise_get_conversion  — /3.0/stats/conversionsbyid (single)
 */

import { getAffiseConversions } from '../../tools/affise_conversions.js';
import { getConversionById } from '../../tools/affise_conversion_by_id.js';
import type { ToolHandler } from './_types.js';

export const handleConversionsRaw: ToolHandler = async (rawParams, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_conversions_raw', args: rawParams }
    );
  }

  // Flatten nested filter object (modern callers pass filter: {...}).
  let params: any = rawParams;
  if (params.filter && typeof params.filter === 'object' && !Array.isArray(params.filter)) {
    params = { ...params, ...params.filter };
    delete params.filter;
  }

  // Legacy alias: affiliate → partner (Conversion.php uses `partner`).
  if (params.affiliate && !params.partner) {
    params.partner = params.affiliate;
    delete params.affiliate;
  }

  if (!params.date_from || !params.date_to) {
    return deps.errorHandler.createErrorResponse(
      'date_from and date_to are required',
      'VALIDATION_ERROR', { toolName: 'affise_conversions_raw', args: params }
    );
  }

  try {
    const result = await getAffiseConversions(config, params);
    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'CONVERSIONS_ERROR',
        { toolName: 'affise_conversions_raw', args: params }
      );
    }
    return {
      status: 'ok',
      message: result.message,
      data: result.data,
      metadata: result.metadata,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    return deps.errorHandler.createErrorResponse(
      `Conversions error: ${error.message}`, 'CONVERSIONS_ERROR',
      { toolName: 'affise_conversions_raw', args: params }, error
    );
  }
};

export const handleGetConversion: ToolHandler = async (args, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_get_conversion', args }
    );
  }
  const id = String(args?.id || '');
  if (!/^[a-fA-F0-9]{24}$/.test(id)) {
    return deps.errorHandler.createErrorResponse(
      'id is required and must be a 24-char hex MongoId',
      'VALIDATION_ERROR', { toolName: 'affise_get_conversion', args }
    );
  }

  try {
    const result = await getConversionById(config, { id, timezone: args.timezone });
    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'CONVERSION_LOOKUP_ERROR',
        { toolName: 'affise_get_conversion', args }
      );
    }
    return { status: 'ok', message: result.message, data: result.data, timestamp: new Date().toISOString() };
  } catch (error: any) {
    return deps.errorHandler.createErrorResponse(
      `Conversion lookup error: ${error.message}`, 'CONVERSION_LOOKUP_ERROR',
      { toolName: 'affise_get_conversion', args }, error
    );
  }
};
