const DASHBOARD_MONTH_PATTERN = /^(19|20)\d{2}-(0[1-9]|1[0-2])$/

export function resolveDashboardMonth(
  requestedMonth: string | undefined,
  now = new Date(),
): string {
  if (requestedMonth && DASHBOARD_MONTH_PATTERN.test(requestedMonth)) {
    return requestedMonth
  }

  const year = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta', year: 'numeric',
  }).format(now)
  const month = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta', month: '2-digit',
  }).format(now)

  return `${year}-${month}`
}
