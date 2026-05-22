// Currency formatting. Compact "$X.Xm" for tooltips/headlines, full for legends.

export function formatCompact(amount: number): string {
  if (!amount) return "$0";
  const abs = Math.abs(amount);
  if (abs >= 1e9) return `$${(amount / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}b`;
  if (abs >= 1e6) return `$${(amount / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}m`;
  if (abs >= 1e3) return `$${(amount / 1e3).toFixed(0)}k`;
  return `$${amount.toFixed(0)}`;
}

const FULL = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

export function formatFull(amount: number): string {
  return FULL.format(amount || 0);
}
