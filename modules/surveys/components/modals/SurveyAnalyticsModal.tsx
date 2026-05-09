import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { surveyApi } from '@/modules/surveys/services/surveyApi'
import { getErrorMessage } from '@/shared/lib/utils'
import type { SurveyAnalytics } from '@/shared/types'

interface Props {
  open: boolean
  onClose: () => void
  surveyId: string | null
  surveyTitle?: string
}

export function SurveyAnalyticsModal({ open, onClose, surveyId, surveyTitle }: Props) {
  const [data, setData] = useState<SurveyAnalytics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !surveyId) return
    setLoading(true); setError(null)
    surveyApi.analytics(surveyId)
      .then(setData)
      .catch((err: unknown) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [open, surveyId])

  if (!open) return null

  const responseRate = data ? (data.total_targeted > 0 ? Math.round((data.total_responded / data.total_targeted) * 100) : 0) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-2xl mx-auto flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Аналитика</h2>
            {surveyTitle && <p className="text-sm text-muted-foreground">{surveyTitle}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading && <p className="text-muted-foreground text-center py-8">Загрузка...</p>}
          {error && <p className="text-destructive text-sm">{error}</p>}

          {data && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm text-muted-foreground mb-1">Охват</p>
                <p className="text-3xl font-bold">{responseRate}%</p>
                <p className="text-sm text-muted-foreground">{data.total_responded} из {data.total_targeted} ответили</p>
                <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${responseRate}%` }} />
                </div>
              </div>

              {data.questions.map((q, idx) => (
                <div key={q.id} className="rounded-xl border border-border p-4">
                  <p className="font-medium mb-3">
                    <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                    {q.text}
                  </p>

                  {(q.type === 'radio' || q.type === 'checkbox') && (
                    q.options.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Пока нет ответов</p>
                    ) : (
                      <div className="space-y-2">
                        {q.options.map((opt) => (
                          <div key={opt.label}>
                            <div className="flex justify-between text-sm mb-1">
                              <span>{opt.label}</span>
                              <span className="text-muted-foreground">{opt.count} ({opt.percent}%)</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary/70 rounded-full" style={{ width: `${opt.percent}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {q.type === 'scale' && (
                    q.average === null ? (
                      <p className="text-sm text-muted-foreground">Пока нет ответов</p>
                    ) : (
                      <div>
                        <p className="text-2xl font-bold mb-3">{q.average} <span className="text-sm font-normal text-muted-foreground">среднее</span></p>
                        <div className="flex gap-2">
                          {Object.entries(q.distribution).map(([score, count]) => (
                            <div key={score} className="flex-1 text-center">
                              <div
                                className="bg-primary/60 rounded-sm mx-auto mb-1"
                                style={{ height: `${Math.max(4, (count / data.total_responded) * 60)}px`, minWidth: '20px' }}
                              />
                              <p className="text-xs text-muted-foreground">{score}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  )}

                  {q.type === 'text' && (
                    q.answers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Пока нет ответов</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {q.answers.map((a, i) => (
                          <div key={i} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">{a}</div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
