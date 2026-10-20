// Money for the API: 12.5 becomes "12.50".
export function formatMoney(n) {
  return Number(n).toFixed(2);
}
