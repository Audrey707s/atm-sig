const DASHBOARD_MONTH_PATTERN = /^(19|20)\d{2}-(0[1-9]|1[0-2])$/

export function resolveDashboardMonth(
  requestedMonth: string | undefined,
  now = new Date(),
): string {
  if (requestedMonth && DASHBOARD_MONTH_PATTERN.test(requestedMonth)) {
    return requestedMonth
  }

  const pieces = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)

  return `${pieces.find((piece) => piece.type === 'year')?.value ?? '2026'}-${pieces.find((piece) => piece.type === 'month')?.value ?? '01'}`
}
