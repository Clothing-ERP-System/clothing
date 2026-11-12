import { AccountHead } from '@/models/Accounting.js';
import Company from '@/models/Company.js';

const REQUIRED_MAPPING_TYPES = {
  grniAccountCode: 'Liability',
  inputTaxAccountCode: 'Asset',
  payableAccountCode: 'Liability',
  inventoryAccountCode: 'Asset',
  cogsAccountCode: 'CostOfGoodsSold',
  expenseAccountCode: 'OperatingExpense',
  salesRevenueAccountCode: 'Revenue',
  salesReceivableAccountCode: 'Asset',
  salesTaxPayableAccountCode: 'Liability',
  salesReturnsAccountCode: 'Revenue',
  bankAccountCode: 'Asset',
  cashAccountCode: 'Asset',
  openingBalanceEquityAccountCode: 'Equity',
  payrollExpenseAccountCode: 'OperatingExpense',
  payrollPayableAccountCode: 'Liability',
  fixedAssetAccountCode: 'Asset',
  accumulatedDepreciationAccountCode: 'Asset',
  depreciationExpenseAccountCode: 'OperatingExpense',
  wipAccountCode: 'Asset',
  scrapWriteOffAccountCode: 'OperatingExpense',
};

// Mandatory mappings that must be configured before related transactions can post.
// Each key maps to a human-readable description for error messages.
const MAPPING_DESCRIPTIONS = {
  grniAccountCode: 'GRNI clearing account',
  inputTaxAccountCode: 'Input tax recoverable account',
  payableAccountCode: 'Supplier payable account',
  inventoryAccountCode: 'Inventory asset account',
  cogsAccountCode: 'Cost of goods sold account',
  expenseAccountCode: 'Operating expense account',
  salesRevenueAccountCode: 'Sales revenue account',
  salesReceivableAccountCode: 'Customer receivable account',
  salesTaxPayableAccountCode: 'Sales tax payable account',
  salesReturnsAccountCode: 'Sales returns account',
  bankAccountCode: 'Bank account',
  cashAccountCode: 'Cash account',
  openingBalanceEquityAccountCode: 'Opening balance equity account',
  payrollExpenseAccountCode: 'Payroll expense account',
  payrollPayableAccountCode: 'Payroll payable account',
  fixedAssetAccountCode: 'Fixed asset account',
  accumulatedDepreciationAccountCode: 'Accumulated depreciation account',
  depreciationExpenseAccountCode: 'Depreciation expense account',
  wipAccountCode: 'Work in Process inventory account',
  scrapWriteOffAccountCode: 'Scrap / loss write-off account',
};

function resolveMapping(mappings, key) {
  if (!mappings || typeof mappings !== 'object') return undefined;
  const code = mappings[key];
  return code ? String(code).trim() : undefined;
}

async function resolveAndValidateMapping(mappings, key, expectedType) {
  const code = resolveMapping(mappings, key);
  if (!code) return { code: undefined, account: undefined, error: undefined };
  const account = await AccountHead.findOne({ code });
  if (!account) {
    return {
      code,
      account: undefined,
      error: `${MAPPING_DESCRIPTIONS[key] || key}: account '${code}' does not exist in the chart of accounts`,
    };
  }
  if (account.type !== expectedType) {
    return {
      code,
      account: undefined,
      error: `${MAPPING_DESCRIPTIONS[key] || key}: account '${code}' must be type '${expectedType}' but is '${account.type}'`,
    };
  }
  return { code, account, error: undefined };
}

async function resolveMultipleMappings(mappings, keys) {
  const results = {};
  const errors = [];
  for (const key of keys) {
    const expectedType = REQUIRED_MAPPING_TYPES[key];
    const result = await resolveAndValidateMapping(mappings, key, expectedType);
    results[key] = { code: result.code, account: result.account };
    if (result.error) errors.push(result.error);
  }
  return { results, errors };
}

function validateMappingsPresent(mappings, requiredKeys, context) {
  const missing = [];
  for (const key of requiredKeys) {
    const code = resolveMapping(mappings, key);
    if (!code) missing.push(MAPPING_DESCRIPTIONS[key] || key);
  }
  if (missing.length > 0) {
    return `Accounting mappings not configured for ${context}: missing ${missing.join(', ')}. Configure them in Administration before posting transactions.`;
  }
  return null;
}

/**
 * Resolve the single company context for accounting operations.
 *
 * The existing data model is single-tenant: Company has no unique fields and User has no
 * companyId field. There is exactly one company record per client database. This helper
 * enforces that assumption: it counts all company records and throws if there are zero
 * or more than one. It never trusts a companyId supplied by the client request body.
 *
 * This must be called inside an active transaction (runInTransaction) so that the
 * Company read participates in the same transaction as subsequent writes.
 */
async function getCompanyContext() {
  const companies = await Company.find({});
  if (companies.length === 0) {
    const error = new Error('No company is configured. Complete client onboarding before posting transactions.');
    error.status = 409;
    throw error;
  }
  if (companies.length > 1) {
    const error = new Error(
      `Multiple company records found (${companies.length}). Single-company database required. ` +
      'Contact system administrator to remove duplicate company records before posting transactions.',
    );
    error.status = 409;
    throw error;
  }
  return companies[0];
}

export {
  REQUIRED_MAPPING_TYPES,
  MAPPING_DESCRIPTIONS,
  resolveMapping,
  resolveAndValidateMapping,
  resolveMultipleMappings,
  validateMappingsPresent,
  getCompanyContext,
};