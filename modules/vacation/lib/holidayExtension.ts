function parseISODate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getVacationExtension(startDate: string, endDate: string, duration: number): { holidaysCount: number; returnDate: string } {
  const spanDays = Math.round((parseISODate(endDate).getTime() - parseISODate(startDate).getTime()) / 86400000) + 1
  const holidaysCount = Math.max(0, spanDays - duration)

  const returnDateObj = parseISODate(endDate)
  returnDateObj.setDate(returnDateObj.getDate() + 1)

  return { holidaysCount, returnDate: formatISODate(returnDateObj) }
}
