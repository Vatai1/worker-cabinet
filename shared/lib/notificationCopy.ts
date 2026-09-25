const STATUS_LABELS: Record<string, string> = {
  approved: 'одобрена',
  rejected: 'отклонена',
}

export function getNotificationBody(type: string, data: Record<string, unknown>): string {
  const d = data || {}
  if (typeof d.message === 'string' && d.message) return d.message

  switch (type) {
    case 'vacation_created':
      return `${(d.employeeName as string) || ''}: ${(d.startDate as string) || ''} — ${(d.endDate as string) || ''}`
    case 'vacation_status_changed': {
      const status = d.status as string
      return `${(d.employeeName as string) || ''}: заявка ${STATUS_LABELS[status] || status || ''} (${(d.startDate as string) || ''} — ${(d.endDate as string) || ''})`
    }
    case 'vacation_substitution':
      return `${(d.employeeName as string) || ''}: ${(d.startDate as string) || ''} — ${(d.endDate as string) || ''}`
    case 'vacation_substitution_removed':
      return 'Вы больше не замещаете на этом отпуске'
    case 'bug_report_new':
      return (d.author as string) || ''
    case 'bug_report_update': {
      const status = d.status as string
      return STATUS_LABELS[status] || status || ''
    }
    default:
      return ''
  }
}
