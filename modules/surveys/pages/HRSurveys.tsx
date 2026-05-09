import { useEffect, useState } from 'react'
import { ClipboardList, BarChart2, Share2, PencilLine, X, Play } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { ConfirmModal } from '@/shared/components/ConfirmModal'
import { SurveyBuilderModal } from '@/modules/surveys/components/modals/SurveyBuilderModal'
import { SurveyAnalyticsModal } from '@/modules/surveys/components/modals/SurveyAnalyticsModal'
import { surveyApi } from '@/modules/surveys/services/surveyApi'
import { useSurveyStore } from '@/modules/surveys/store/surveyStore'
import { getErrorMessage, formatDate } from '@/shared/lib/utils'
import type { Survey, SurveyWithQuestions } from '@/shared/types'

const STATUS_TABS = [
  { value: 'active', label: 'Активные' },
  { value: 'draft', label: 'Черновики' },
  { value: 'closed', label: 'Закрытые' },
]

const STATUS_COLORS: Record<string, string> = {
  active: 'text-green-500 bg-green-500/10',
  draft: 'text-yellow-500 bg-yellow-500/10',
  closed: 'text-muted-foreground bg-muted',
}

const TARGET_LABELS: Record<string, string> = {
  all: 'Все сотрудники',
  department: 'Отдел',
  employees: 'Выбранные сотрудники',
}

export function HRSurveys() {
  const { surveys, loading, error, fetchSurveys, publishSurvey, closeSurvey, removeSurvey } = useSurveyStore()
  const [tab, setTab] = useState('active')
  const [search, setSearch] = useState('')
  const [showBuilder, setShowBuilder] = useState(false)
  const [editSurvey, setEditSurvey] = useState<SurveyWithQuestions | null>(null)
  const [analyticsId, setAnalyticsId] = useState<string | null>(null)
  const [analyticsTitle, setAnalyticsTitle] = useState<string | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Survey | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => { fetchSurveys() }, [fetchSurveys])

  const filtered = surveys.filter((s) => {
    return s.status === tab && s.title.toLowerCase().includes(search.toLowerCase())
  })

  const tabCounts = Object.fromEntries(
    STATUS_TABS.map((t) => [t.value, surveys.filter((s) => s.status === t.value).length])
  )

  const handleShare = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/surveys/${id}`)
  }

  const handleEdit = async (survey: Survey) => {
    try {
      const full = await surveyApi.get(survey.id)
      setEditSurvey(full)
      setShowBuilder(true)
    } catch (err: unknown) {
      setActionError(getErrorMessage(err))
    }
  }

  const handlePublish = async (id: string) => {
    try { await publishSurvey(id) }
    catch (err: unknown) { setActionError(getErrorMessage(err)) }
  }

  const handleClose = async (id: string) => {
    try { await closeSurvey(id) }
    catch (err: unknown) { setActionError(getErrorMessage(err)) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try { await removeSurvey(deleteTarget.id); setDeleteTarget(null) }
    catch (err: unknown) { setActionError(getErrorMessage(err)) }
  }

  const activeSurveys = surveys.filter((s) => s.status === 'active')
  const avgRate = activeSurveys.length > 0
    ? Math.round(activeSurveys.reduce((sum, s) => {
        const responded = Number(s.responseCount ?? 0)
        const targeted = Number(s.totalTargeted ?? 0)
        return sum + (targeted > 0 ? responded / targeted : 0)
      }, 0) / activeSurveys.length * 100)
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Опросы</h1>
          <p className="text-muted-foreground text-sm mt-1">Создание опросов и аналитика ответов</p>
        </div>
        <Button onClick={() => { setEditSurvey(null); setShowBuilder(true) }}>
          <ClipboardList className="h-4 w-4 mr-2" />
          Создать опрос
        </Button>
      </div>

      {(error || actionError) && (
        <p className="text-destructive text-sm">{error || actionError}</p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-2xl font-bold text-primary">{tabCounts.active ?? 0}</p>
          <p className="text-sm text-muted-foreground">Активных</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-2xl font-bold">{surveys.length}</p>
          <p className="text-sm text-muted-foreground">Всего</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-2xl font-bold text-green-500">{avgRate}%</p>
          <p className="text-sm text-muted-foreground">Средний охват</p>
        </div>
      </div>

      {/* Tabs + search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.value ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label} ({tabCounts[t.value] ?? 0})
            </button>
          ))}
        </div>
        <Input placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
      </div>

      {/* Survey list */}
      {loading ? (
        <p className="text-muted-foreground">Загрузка...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p>Опросов нет</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <div key={s.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[s.status]}`}>
                      {STATUS_TABS.find((t) => t.value === s.status)?.label}
                    </span>
                    <span className="text-sm font-semibold truncate">{s.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {s.questionCount ?? 0} вопр. · {TARGET_LABELS[s.targetType]}
                    {s.deadline ? ` · До ${formatDate(s.deadline)}` : ''}
                  </p>
                  {s.status === 'active' && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${s.totalTargeted ? Math.min(100, ((Number(s.responseCount) ?? 0) / s.totalTargeted) * 100) : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{s.responseCount ?? 0} ответов</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {s.status === 'active' && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => { setAnalyticsId(s.id); setAnalyticsTitle(s.title) }}>
                        <BarChart2 className="h-3 w-3 mr-1" /> Аналитика
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleShare(s.id)}>
                        <Share2 className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleClose(s.id)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                  {s.status === 'draft' && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => handleEdit(s)}>
                        <PencilLine className="h-3 w-3 mr-1" /> Редактировать
                      </Button>
                      <Button size="sm" onClick={() => handlePublish(s.id)}>
                        <Play className="h-3 w-3 mr-1" /> Опубликовать
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(s)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                  {s.status === 'closed' && (
                    <Button variant="outline" size="sm" onClick={() => { setAnalyticsId(s.id); setAnalyticsTitle(s.title) }}>
                      <BarChart2 className="h-3 w-3 mr-1" /> Аналитика
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <SurveyBuilderModal
        open={showBuilder}
        onClose={() => { setShowBuilder(false); setEditSurvey(null) }}
        onSaved={fetchSurveys}
        editSurvey={editSurvey}
      />
      <SurveyAnalyticsModal
        open={!!analyticsId}
        onClose={() => setAnalyticsId(null)}
        surveyId={analyticsId}
        surveyTitle={analyticsTitle}
      />
      <ConfirmModal
        isOpen={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Удалить опрос"
        message={`Удалить опрос "${deleteTarget?.title}"? Все ответы будут удалены.`}
      />
    </div>
  )
}
