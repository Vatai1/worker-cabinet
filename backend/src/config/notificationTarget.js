function str(value) {
  if (value === null || value === undefined) return null
  const s = String(value)
  return s.length > 0 ? s : null
}

export function getNotificationUrl(type, data, userId) {
  const d = data || {}

  switch (type) {
    case 'vacation_created': {
      const requestId = str(d.requestId)
      if (!requestId) return null
      const employeeId = str(d.employeeId)
      const isAuthor = userId != null && employeeId === String(userId)
      const tab = isAuthor ? 'history' : 'approvals'
      return `/vacation?tab=${tab}&requestId=${requestId}`
    }

    case 'vacation_status_changed':
    case 'vacation_substitution':
    case 'vacation_substitution_removed': {
      const requestId = str(d.requestId)
      if (!requestId) return null
      return `/vacation?tab=history&requestId=${requestId}`
    }

    case 'bug_report_new': {
      const reportId = str(d.reportId)
      if (!reportId) return null
      return `/admin/global?tab=bug-reports&reportId=${reportId}`
    }

    case 'bug_report_update':
    case 'bug_report_reply':
      return '/notifications'

    case 'document_assigned': {
      const documentId = str(d.documentId)
      if (!documentId) return null
      return `/documents?documentId=${documentId}`
    }

    case 'survey_assigned': {
      const surveyId = str(d.surveyId)
      if (!surveyId) return null
      return `/surveys?surveyId=${surveyId}`
    }

    case 'onboarding_task': {
      const taskId = str(d.taskId)
      if (!taskId) return null
      return `/onboarding?taskId=${taskId}`
    }

    case 'mailing':
    case 'generic':
    default:
      return null
  }
}
