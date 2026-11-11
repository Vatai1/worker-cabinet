import { getNotificationTarget, type NotificationLike } from '@/shared/lib/notificationTarget'
import { markNotificationRead } from '@/shared/lib/notificationsApi'
import { infoDialog } from '@/shared/components/ConfirmDialog'
import { useOrgStore } from '@/shared/store/orgStore'
import { setCookie } from '@/shared/lib/cookies'

interface ClickableNotification extends NotificationLike {
  id: number
  read_at?: string | null
}

const BUG_REPORT_STATUS_LABELS: Record<string, string> = {
  new: 'Новый',
  in_progress: 'В работе',
  resolved: 'Решён',
  rejected: 'Отклонён',
}

function showBugReportNotification(n: ClickableNotification) {
  const title = String(n.data.title ?? 'Баг-репорт')
  if (n.type === 'bug_report_reply') {
    infoDialog({ title: `Ответ на баг-репорт «${title}»`, message: String(n.data.message ?? '') })
    return
  }
  const status = String(n.data.status ?? '')
  infoDialog({ title: `Баг-репорт «${title}»`, message: `Статус изменён: ${BUG_REPORT_STATUS_LABELS[status] ?? status}` })
}

export async function openNotification(
  n: ClickableNotification,
  navigate: (path: string) => void,
  currentUserId?: string | number | null
): Promise<boolean> {
  if (n.type === 'bug_report_reply' || n.type === 'bug_report_update') {
    showBugReportNotification(n)
  } else {
    const target = getNotificationTarget(n, currentUserId)
    if (target && n.type === 'timesheet_returned') {
      const orgId = Number(n.data.organizationId)
      const { currentOrgId, organizations } = useOrgStore.getState()
      if (orgId !== currentOrgId && organizations.some(org => org.id === orgId)) {
        const marked = !n.read_at && await markNotificationRead(n.id).then(() => true, () => false)
        setCookie('active_org_id', String(orgId))
        window.location.assign(target.path)
        return marked
      }
    }
    if (target) navigate(target.path)
  }
  if (n.read_at) return false
  try {
    await markNotificationRead(n.id)
    return true
  } catch {
    return false
  }
}
