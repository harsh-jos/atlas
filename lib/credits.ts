/** Round credit displays without changing ledger values. */
export function formatCredits(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
