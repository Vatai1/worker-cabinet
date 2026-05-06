import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, CheckCircle2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { surveyApi } from '@/services/surveyApi'
import { getErrorMessage, formatDate } from '@/lib/utils'
import type { Survey } from '@/types'

type SurveyWithResponded = Survey & { responded: boolean }

const TARGET_LABELS: Record<string, string> = {
  all: 'Для всех', department: 'Отдел', employees: 'Выбранные сотрудники',
}

export function Surveys() {
  const [surveys, setSurveys] = useState<SurveyWithResponded[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    surveyApi.listMy()
      .then((data) => setSurveys(data as SurveyWithResponded[]))
      .catch((err: unknown) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Опросы</h1>
        <p className="text-muted-foreground text-sm mt-1">Актуальные опросы для вас</p>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground">Загрузка...</p>
      ) : surveys.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <ClipboardList className="h-16 w-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Для вас нет активных опросов</p>
          <p className="text-sm mt-1">Вы увидите опросы здесь, когда HR опубликует их для вас</p>
        </div>
      ) : (
        <div className="space-y-3">
          {surveys.map((s) => (
            <div key={s.id} className="rounded-xl border border-border bg-background p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{s.title}</h3>
                    {s.responded && (
                      <span className="flex items-center gap-1 text-xs text-green-500 border border-green-500/30 bg-green-500/10 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="h-3 w-3" /> Пройдено
                      </span>
                    )}
                  </div>
                  {s.description && <p className="text-sm text-muted-foreground mb-2">{s.description}</p>}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{TARGET_LABELS[s.targetType]}</span>
                    {s.deadline && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> До {formatDate(s.deadline)}
                      </span>
                    )}
                  </div>
                </div>
                {!s.responded && (
                  <Button onClick={() => navigate(`/surveys/${s.id}`)}>
                    Пройти опрос
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
