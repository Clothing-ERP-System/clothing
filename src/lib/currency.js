/**
 * Shared currency formatting and resolution for ERP DOST.
 * Default currency is Pakistani Rupees (PKR / Rs.).
 */

export const DEFAULT_CURRENCY = 'PKR';
export const DEFAULT_CURRENCY_SYMBOL = 'Rs.';

const CURRENCY_SYMBOLS = {
  PKR: 'Rs.',
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
};

/**
 * Resolve the currency symbol respecting explicit company configuration,
 * falling back to mapped code, or default Rs.
 */
export function getCurrencySymbol(currency, configuredSymbol) {
  if (configuredSymbol && typeof configuredSymbol === 'string' && configuredSymbol.trim()) {
    return configuredSymbol.trim();
  }
  if (!currency) return DEFAULT_CURRENCY_SYMBOL;
  const upper = String(currency).trim().toUpperCase();
  return CURRENCY_SYMBOLS[upper] || (upper === 'PKR' ? DEFAULT_CURRENCY_SYMBOL : currency) || DEFAULT_CURRENCY_SYMBOL;
}

/**
 * Format an amount into localized currency display (e.g. Rs. 1,500 or -Rs. 200).
 */
export function formatCurrency(amount, symbol = DEFAULT_CURRENCY_SYMBOL) {
  const numeric = Number(amount);
  const safeNum = Number.isFinite(numeric) ? numeric : 0;
  const isNegative = safeNum < 0;
  const absValue = Math.abs(safeNum);
  const formatted = absValue.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const sym = symbol || DEFAULT_CURRENCY_SYMBOL;
  return isNegative ? `-${sym} ${formatted}` : `${sym} ${formatted}`;
}

