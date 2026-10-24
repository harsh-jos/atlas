/** Preserve the ledger's precision while keeping whole balances readable. */
export function formatCredits(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
