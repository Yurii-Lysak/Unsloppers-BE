/** Previous/current/next calendar months (UTC) around `now`, in that order. */
export function monthsToQuery(
  now: Date,
): Array<{ month: number; year: number }> {
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  const previous =
    month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
  const next =
    month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
  return [previous, { month, year }, next];
}
