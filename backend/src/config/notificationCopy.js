const TYPE_LABELS = {
  vacation_created: 'Заявка на отпуск',
  vacation_status_changed: 'Статус отпуска',
  vacation_substitution: 'Замещение на отпуске',
  vacation_substitution_removed: 'Замещение отменено',
  bug_report_new: 'Баг-репорт',
  bug_report_update: 'Статус баг-репорта',
  bug_report_reply: 'Ответ на баг-репорт',
  document_assigned: 'Документ для ознакомления',
  survey_assigned: 'Новый опрос',
  onboarding_task: 'Задача онбординга',
}

const STATUS_LABELS = { approved: 'одобрена', rejected: 'отклонена' }

function buildBody(type, data) {
  const d = data || {}
  switch (type) {
    case 'vacation_created':
      return `${d.employeeName || ''}: ${d.startDate || ''} — ${d.endDate || ''}`
    case 'vacation_status_changed':
      return `${d.employeeName || ''}: заявка ${STATUS_LABELS[d.status] || d.status} (${d.startDate || ''} — ${d.endDate || ''})`
    case 'vacation_substitution':
      return `${d.employeeName || ''}: ${d.startDate || ''} — ${d.endDate || ''}`
    case 'vacation_substitution_removed':
      return 'Вы больше не замещаете на этом отпуске'
    case 'bug_report_new':
      return d.author || ''
    case 'bug_report_update':
      return STATUS_LABELS[d.status] || d.status || ''
    case 'bug_report_reply':
      return d.message || ''
    case 'document_assigned':
    case 'survey_assigned':
    case 'onboarding_task':
      return TYPE_LABELS[type] || ''
    default:
      return ''
  }
}

export function getPushCopy(type, data) {
  const title = (data && (data.subject || data.title)) || TYPE_LABELS[type] || type
  const body = buildBody(type, data)
  return { title, body }
}
