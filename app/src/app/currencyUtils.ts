/**
 * Formats a cost value in USD to the specified target currency (USD, EUR, GBP)
 * using the conversions: EUR (€) = 0.92, GBP (£) = 0.78.
 */
export function formatCost(usdCost: number, currency: string = 'USD', decimals: number = 3): string {
  let symbol = '$';
  let converted = usdCost;

  if (currency === 'EUR') {
    symbol = '€';
    converted = usdCost * 0.92;
  } else if (currency === 'GBP') {
    symbol = '£';
    converted = usdCost * 0.78;
  }

  return `${symbol}${converted.toFixed(decimals)}`;
}
