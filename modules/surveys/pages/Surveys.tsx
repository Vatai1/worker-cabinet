import { useEffect, useState, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/shared/components/ui/Button'
import { ClipboardList, CheckCircle2, Clock, Sparkles, ArrowRight, BarChart3, Zap } from 'lucide-react'
import { surveyApi } from '@/modules/surveys/services/surveyApi'
import { getErrorMessage, formatDate } from '@/shared/lib/utils'
import type { Survey } from '@/shared/types'
import { PageBanner, BannerPill } from '@/shared/components/PageBanner'

type SurveyWithResponded = Survey & { responded: boolean }

const TARGET_LABELS: Record<string, string> = {
  all: 'Для всех', department: 'Отдел', employees: 'Выбранные работники',
}

const surveyColors = [
  { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', accent: 'from-violet-500/20 to-violet-500/0', icon: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  { bg: 'bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', accent: 'from-indigo-500/20 to-indigo-500/0', icon: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
  { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', accent: 'from-blue-500/20 to-blue-500/0', icon: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  { bg: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', accent: 'from-cyan-500/20 to-cyan-500/0', icon: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' },
  { bg: 'bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400', accent: 'from-teal-500/20 to-teal-500/0', icon: 'bg-teal-500/10 text-teal-600 dark:text-teal-400' },
  { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', accent: 'from-amber-500/20 to-amber-500/0', icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  { bg: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', accent: 'from-rose-500/20 to-rose-500/0', icon: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', accent: 'from-emerald-500/20 to-emerald-500/0', icon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
]

export function Surveys() {
  const [surveys, setSurveys] = useState<SurveyWithResponded[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const deepLinkSurveyId = new URLSearchParams(location.search).get('surveyId')

  useEffect(() => {
    surveyApi.listMy()
      .then((data) => setSurveys(data as SurveyWithResponded[]))
      .catch((err: unknown) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!deepLinkSurveyId || surveys.length === 0) return
    document.getElementById(`survey-${deepLinkSurveyId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [deepLinkSurveyId, surveys])

  const respondedCount = useMemo(() => surveys.filter((s) => s.responded).length, [surveys])
  const pendingCount = useMemo(() => surveys.filter((s) => !s.responded).length, [surveys])
  const urgentCount = useMemo(() => {
    const now = new Date()
    return surveys.filter((s) => {
      if (s.responded || !s.deadline) return false
      const deadline = new Date(s.deadline)
      const diff = deadline.getTime() - now.getTime()
      return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000
    }).length
  }, [surveys])

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center animate-fade-in">
        <p className="text-destructive font-medium">{error}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="h-40 rounded-2xl border border-border bg-muted/40 animate-pulse" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (surveys.length === 0) {
    return (
      <div className="space-y-8 animate-fade-in">
        <PageBanner
          icon={Sparkles}
          eyebrow="Обратная связь"
          title="Опросы"
          subtitle="Ваше мнение помогает нам становиться лучше"
        />
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/60 mb-4">
            <ClipboardList className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <p className="text-lg font-semibold text-muted-foreground/80">Для вас нет активных опросов</p>
          <p className="text-sm text-muted-foreground/50 mt-1">Вы увидите опросы здесь, когда HR опубликует их для вас</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <PageBanner
        icon={Sparkles}
        eyebrow="Обратная связь"
        title="Опросы"
        subtitle="Ваше мнение помогает нам становиться лучше"
        meta={
          <>
            <BannerPill icon={BarChart3}>{surveys.length} {surveys.length === 1 ? 'опрос' : surveys.length < 5 ? 'опроса' : 'опросов'}</BannerPill>
            {respondedCount > 0 && <BannerPill icon={CheckCircle2} tone="success">{respondedCount} пройдено</BannerPill>}
            {urgentCount > 0 && <BannerPill icon={Zap} tone="warning">{urgentCount} скоро дедлайн</BannerPill>}
          </>
        }
      />

      {pendingCount > 0 && (
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-sm font-medium">{pendingCount} {pendingCount === 1 ? 'опрос ожидает' : pendingCount < 5 ? 'опроса ожидают' : 'опросов ожидают'} ответа</span>
        </div>
      )}

      <div className="space-y-4">
        {surveys.map((s, index) => {
          const color = surveyColors[index % surveyColors.length]
          const staggerClass = index < 8 ? `stagger-${index + 1}` : 'stagger-8'
          const isExpired = s.deadline && new Date(s.deadline) < new Date()
          return (
            <div
              key={s.id}
              id={`survey-${s.id}`}
              className={`group hover-lift rounded-2xl border overflow-hidden shadow-sm transition-all duration-200 animate-slide-up ${staggerClass} ${deepLinkSurveyId === String(s.id) ? 'border-primary ring-2 ring-primary bg-card' : 'border-border/60 bg-card'}`}
            >
              <div className={`h-1 bg-gradient-to-r ${color.accent}`} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className={`h-12 w-12 shrink-0 rounded-xl ${color.icon} flex items-center justify-center transition-transform duration-200 group-hover:scale-110`}>
                      {s.responded ? (
                        <CheckCircle2 className="h-6 w-6" />
                      ) : (
                        <ClipboardList className="h-6 w-6" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-[15px] leading-tight group-hover:text-primary transition-colors duration-200">
                          {s.title}
                        </h3>
                        {s.responded && (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium">
                            <CheckCircle2 className="h-3 w-3" /> Пройдено
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{s.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5">
                          {TARGET_LABELS[s.targetType]}
                        </span>
                        {s.deadline && (
                          <span className={`flex items-center gap-1 ${isExpired && !s.responded ? 'text-red-500' : ''}`}>
                            <Clock className="h-3 w-3" />
                            До {formatDate(s.deadline)}
                            {isExpired && !s.responded && <span className="ml-1 text-red-400">(истёк)</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {!s.responded && (
                    <Button
                      onClick={() => navigate(`/surveys/${s.id}`)}
                      className="shrink-0 group/btn"
                    >
                      Пройти
                      <ArrowRight className="ml-1.5 h-4 w-4 group-hover/btn:translate-x-0.5 transition-transform" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
