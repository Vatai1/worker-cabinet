export interface NotificationLike {
  type: string
  data: Record<string, unknown>
}

export interface NotificationTarget {
  path: string
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value)
  return s.length > 0 ? s : null
}

export function getNotificationTarget(
  n: NotificationLike,
  currentUserId?: string | number | null
): NotificationTarget | null {
  const data = n.data || {}

  switch (n.type) {
    case 'vacation_created': {
      const requestId = str(data.requestId)
      if (!requestId) return null
      const employeeId = str(data.employeeId)
      const isAuthor = currentUserId != null && employeeId === String(currentUserId)
      const tab = isAuthor ? 'history' : 'approvals'
      return { path: `/vacation?tab=${tab}&requestId=${requestId}` }
    }

    case 'vacation_status_changed':
    case 'vacation_substitution':
    case 'vacation_substitution_removed': {
      const requestId = str(data.requestId)
      if (!requestId) return null
      return { path: `/vacation?tab=history&requestId=${requestId}` }
    }

    case 'bug_report_new':
    case 'bug_report_update': {
      const reportId = str(data.reportId)
      if (!reportId) return null
      return { path: `/admin/global?tab=bug-reports&reportId=${reportId}` }
    }

    case 'document_assigned': {
      const documentId = str(data.documentId)
      if (!documentId) return null
      return { path: `/documents?documentId=${documentId}` }
    }

    case 'survey_assigned': {
      const surveyId = str(data.surveyId)
      if (!surveyId) return null
      return { path: `/surveys?surveyId=${surveyId}` }
    }

    case 'onboarding_task': {
      const taskId = str(data.taskId)
      if (!taskId) return null
      return { path: `/onboarding?taskId=${taskId}` }
    }

    case 'mailing':
    case 'generic':
    default:
      return null
  }
}
