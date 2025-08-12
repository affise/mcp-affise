// Core types
interface FieldRule {
  readonly requires?: readonly string[];
  readonly disabledBy?: readonly string[];
}

interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly suggestions: readonly string[];
}

interface AutoFixResult {
  readonly slices: readonly string[];
  readonly fields: readonly string[];
  readonly changes: readonly string[];
}

interface SuggestionResult {
  readonly compatibleSlices: readonly string[];
  readonly compatibleFields: readonly string[];
}

// Field groups (simplified with spread operator usage)
const SLICES = {
  dates: ['day', 'hour', 'month', 'year'],
  geo: ['city', 'conn_type', 'country', 'isp'],
  entities: ['advertiser', 'advertiser_manager_id', 'affiliate', 'affiliate_manager_id', 'offer', 'landing', 'prelanding', 'smart_id'],
  technical: ['browser', 'device', 'device_model', 'os'],
  subs: ['sub1', 'sub2', 'sub3', 'sub4', 'sub5', 'sub6', 'sub7', 'sub8'],
  subs30: ['sub9', 'sub10', 'sub11', 'sub12', 'sub13', 'sub14', 'sub15', 'sub16', 'sub17', 'sub18', 'sub19', 'sub20', 'sub21', 'sub22', 'sub23', 'sub24', 'sub25', 'sub26', 'sub27', 'sub28', 'sub29', 'sub30']
} as const;

const CONVERSIONS: readonly string[] = ['conversions_confirmed', 'conversions_declined', 'conversions_hold', 'conversions_not_found', 'conversions_pending'];

const ALL_SLICES: readonly string[] = [...SLICES.dates, ...SLICES.geo, ...SLICES.entities, ...SLICES.technical, ...SLICES.subs, ...SLICES.subs30];
const ALL_COMPATIBLE_SLICES: readonly string[] = [...SLICES.dates, ...SLICES.geo, ...SLICES.entities, ...SLICES.technical, ...SLICES.subs, 'smart_id'];

// Simplified rule definitions using helper functions
const createRule = (requires: readonly string[] = [], disabledBy: readonly string[] = []): FieldRule => ({ requires, disabledBy });

const createConversionRule = (additionalRequires: readonly string[] = []): FieldRule => 
  createRule([...ALL_COMPATIBLE_SLICES, 'currency', 'goal', ...additionalRequires], ['trafficback_reason']);

const createTrafficRule = (): FieldRule => 
  createRule(ALL_COMPATIBLE_SLICES, ['trafficback_reason', ...SLICES.subs30]);

// Cost fields disabled by many slices
const COSTS_DISABLED_BY: readonly string[] = [
  ...SLICES.geo, ...SLICES.technical, 'advertiser_id', 'affiliate_manager', 'account_manager', 
  'trafficback_reason', 'goal', 'smart_id', ...SLICES.subs, ...SLICES.subs30
];

// Field rules with pattern-based generation
const FIELD_RULES: Record<string, FieldRule> = {
  // Basic slices (no requirements)
  ...Object.fromEntries(ALL_SLICES.map(slice => [slice, createRule()])),
  
  // Additional basic fields
  week: createRule(),
  affiliate_email: createRule(),
  affiliate_manager: createRule(),
  account_manager: createRule(),
  browser_version: createRule(),
  currency: createRule(),
  
  // Dependency rules
  advertiser_manager_id: createRule(['advertiser']),
  affiliate_manager_id: createRule(['affiliate']),
  affiliate_id: createRule(['affiliate']),
  advertiser_id: createRule(['advertiser']),
  offer_id: createRule(['offer']),
  external_offer_id: createRule(['offer']),
  offer_status: createRule(['offer']),
  goal: createRule([], ['clicks']),
  
  // Sub30 fields (pattern-based)
  ...Object.fromEntries(
    SLICES.subs30.map(sub => [sub, createRule([...CONVERSIONS], ['clicks', 'views', 'hosts', 'costs'])])
  ),
  
  // Traffic back reason
  trafficback_reason: createRule([], [...CONVERSIONS, 'clicks', 'views', 'payouts', 'income', 'earnings', 'hosts', ...SLICES.subs30]),
  
  // Traffic fields
  clicks: createRule(ALL_COMPATIBLE_SLICES, ['trafficback_reason', 'goal', ...SLICES.subs30]),
  hosts: createTrafficRule(),
  views: createRule([...SLICES.dates, ...SLICES.geo, ...SLICES.entities, ...SLICES.technical, ...SLICES.subs], ['trafficback_reason', ...SLICES.subs30]),
  
  // Revenue fields
  earnings: createConversionRule([...SLICES.subs30]),
  income: createConversionRule([...SLICES.subs30]),
  payouts: createConversionRule([...SLICES.subs30]),
  afprice: createRule([...SLICES.dates], ['trafficback_reason']),
  
  // Conversion fields (pattern-based)
  ...Object.fromEntries(
    CONVERSIONS.map(conv => [conv, createConversionRule()])
  ),
  
  // Related fields
  clicks_income: createRule(['clicks']),
  clicks_earnings: createRule(['clicks']),
  clicks_payouts: createRule(['clicks']),
  impressions_income: createRule(['views']),
  impressions_earnings: createRule(['views']),
  impressions_payouts: createRule(['views']),
  
  // Traffic analysis
  trafficback: createRule([...SLICES.dates, ...SLICES.geo, 'trafficback_reason'], [...SLICES.subs30]),
  
  // Calculated metrics
  cr: createRule([...CONVERSIONS, 'clicks'], ['trafficback_reason']),
  affiliate_epc: createRule(['clicks', 'income'], ['trafficback_reason']),
  ctr: createRule(['clicks', 'views'], ['trafficback_reason']),
  epc: createRule(['clicks', 'income'], ['trafficback_reason']),
  ecpm: createRule(['income', 'views'], ['trafficback_reason']),
  ratio: createRule([...CONVERSIONS, 'clicks', 'earnings', 'hosts', 'income', 'payouts', 'views'], ['trafficback_reason']),
  
  // Cost analysis
  costs: createRule([...SLICES.dates.filter(d => d !== 'hour'), 'sub8', 'offer', 'offer_id', 'affiliate', 'affiliate_id'], COSTS_DISABLED_BY),
  margin: createRule(['costs'], COSTS_DISABLED_BY),
  roi: createRule(['costs'], COSTS_DISABLED_BY),
  
  // Aggregated metrics
  conversions_total: createRule([...CONVERSIONS], ['trafficback_reason']),
  nonzero: createRule([...CONVERSIONS, 'clicks', 'hosts', 'views'], ['trafficback_reason'])
};

/**
 * Simplified validation functions
 */
function isFieldActive(field: string, currentFields: readonly string[]): boolean {
  const rule = FIELD_RULES[field];
  if (!rule?.requires?.length) return true;
  return rule.requires.some(required => currentFields.includes(required));
}

function isFieldDisabled(field: string, currentFields: readonly string[]): boolean {
  const rule = FIELD_RULES[field];
  if (!rule?.disabledBy?.length) return false;
  return rule.disabledBy.some(disabler => currentFields.includes(disabler));
}

/**
 * Main validation function
 */
export function validateFieldCombination(slices: readonly string[], fields: readonly string[]): ValidationResult {
  const allFields = [...slices, ...fields];
  const errors: string[] = [];
  const suggestions: string[] = [];
  
  for (const field of allFields) {
    const rule = FIELD_RULES[field];
    if (!rule) continue;
    
    // Check requirements
    if (rule.requires?.length && !rule.requires.some(req => allFields.includes(req))) {
      const missing = rule.requires.filter(req => !allFields.includes(req));
      errors.push(`Field '${field}' requires one of: ${missing.join(', ')}`);
      suggestions.push(`Add one of: ${missing.slice(0, 3).join(', ')}`);
    }
    
    // Check conflicts
    if (rule.disabledBy?.length) {
      const conflicts = rule.disabledBy.filter(disabler => allFields.includes(disabler));
      if (conflicts.length > 0) {
        errors.push(`Field '${field}' cannot be used with: ${conflicts.join(', ')}`);
        suggestions.push(`Remove ${conflicts[0]} to use ${field}`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    suggestions: [...new Set(suggestions)].slice(0, 3)
  };
}

/**
 * Auto-fix invalid combinations
 */
export function autoFixFieldCombination(slices: readonly string[], fields: readonly string[]): AutoFixResult {
  let fixedSlices = [...slices];
  let fixedFields = [...fields];
  const changes: string[] = [];
  
  const allFields = [...fixedSlices, ...fixedFields];
  
  // Remove disabled fields
  for (const field of allFields) {
    if (isFieldDisabled(field, allFields)) {
      const rule = FIELD_RULES[field];
      const conflicts = rule?.disabledBy?.filter(disabler => allFields.includes(disabler)) || [];
      
      if (conflicts.length > 0) {
        if (fixedSlices.includes(field)) {
          fixedSlices = fixedSlices.filter(f => f !== field);
          changes.push(`Removed slice '${field}' (conflicts with ${conflicts[0]})`);
        }
        if (fixedFields.includes(field)) {
          fixedFields = fixedFields.filter(f => f !== field);
          changes.push(`Removed field '${field}' (conflicts with ${conflicts[0]})`);
        }
      }
    }
  }
  
  return { slices: fixedSlices, fields: fixedFields, changes };
}

/**
 * Get compatible field suggestions
 */
export function getSuggestedFields(slices: readonly string[], fields: readonly string[]): SuggestionResult {
  const currentFields = [...slices, ...fields];
  const compatibleSlices: string[] = [];
  const compatibleFields: string[] = [];
  
  for (const [field, rule] of Object.entries(FIELD_RULES)) {
    const testFields = [...currentFields, field];
    if (isFieldActive(field, testFields) && !isFieldDisabled(field, testFields)) {
      if (ALL_SLICES.includes(field) || ['currency', 'goal', 'smart_id'].includes(field)) {
        compatibleSlices.push(field);
      } else {
        compatibleFields.push(field);
      }
    }
  }
  
  return {
    compatibleSlices: compatibleSlices.filter(f => !slices.includes(f)).slice(0, 5),
    compatibleFields: compatibleFields.filter(f => !fields.includes(f)).slice(0, 5)
  };
}

/**
 * Normalize field names and handle aliases
 */
export function normalizeFieldNames(fields: readonly string[]): string[] {
  const fieldMap: Record<string, string> = {
    'revenue': 'income',
    'confirmed': 'conversions_confirmed',
    'pending': 'conversions_pending',
    'declined': 'conversions_declined',
    'hold': 'conversions_hold',
    'not_found': 'conversions_not_found',
    'total': 'conversions_total',
    'aff_epc': 'affiliate_epc',
    'affiliate_earnings_per_click': 'affiliate_epc',
    'click_through_rate': 'ctr'
  };
  
  const autoIncludedWithIncome = [
    'conversions_confirmed', 'conversions_pending', 'conversions_declined',
    'conversions_hold', 'conversions_not_found', 'conversions_total'
  ];
  
  const normalizedFields = fields.map(field => fieldMap[field] || field);
  const hasConversionFields = normalizedFields.some(field => autoIncludedWithIncome.includes(field));
  const filteredFields = normalizedFields.filter(field => !autoIncludedWithIncome.includes(field));
  
  if (hasConversionFields && !filteredFields.includes('income')) {
    filteredFields.push('income');
  }
  
  return filteredFields;
}

// Export constants for external use
export { SLICES as SLICES_GROUPS, CONVERSIONS as CONVERSION_TYPES };