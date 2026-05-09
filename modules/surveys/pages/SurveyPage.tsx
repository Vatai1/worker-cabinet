import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { surveyApi } from '@/modules/surveys/services/surveyApi'
import { getErrorMessage, formatDate } from '@/shared/lib/utils'
import type { SurveyWithQuestions } from '@/shared/types'

const LS_KEY = 'completed_surveys'

function getCompleted(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
function markCompleted(id: string) {
  const list = getCompleted()
  if (!list.includes(id)) localStorage.setItem(LS_KEY, JSON.stringify([...list, id]))
}

export function SurveyPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [survey, setSurvey] = useState<SurveyWithQuestions | null>(null)
  const [loading, setLoading] = useState(true)
  const [blockMessage, setBlockMessage] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<number, string | string[]>>({})
  const [errors, setErrors] = useState<Record<number, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const firstErrorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return
    if (getCompleted().includes(id)) { setBlockMessage('Вы уже прошли этот опрос'); setLoading(false); return }
    surveyApi.view(id)
      .then(setSurvey)
      .catch((err: unknown) => setBlockMessage(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id])

  const setAnswer = (questionId: number, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
    setErrors((prev) => ({ ...prev, [questionId]: false }))
  }

  const toggleCheckbox = (questionId: number, option: string) => {
    const current = (answers[questionId] as string[]) || []
    setAnswer(questionId, current.includes(option) ? current.filter((v) => v !== option) : [...current, option])
  }

  const handleSubmit = async () => {
    if (!survey) return
    const newErrors: Record<number, boolean> = {}
    for (const q of survey.questions) {
      if (!q.required) continue
      const a = answers[Number(q.id)]
      if (!a || (Array.isArray(a) && a.length === 0) || a === '') {
        newErrors[Number(q.id)] = true
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setTimeout(() => firstErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      return
    }

    setSubmitting(true); setSubmitError(null)
    try {
      const payload = (survey.questions || []).map((q) => {
        const qId = Number(q.id)
        const a = answers[qId]
        if (q.type === 'checkbox') return { questionId: qId, values: (a as string[]) || [] }
        return { questionId: qId, value: (a as string) || '' }
      })
      await surveyApi.respond(id!, payload)
      markCompleted(id!)
      setSubmitted(true)
    } catch (err: unknown) {
      setSubmitError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground">Загрузка...</p></div>

  if (blockMessage) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
      <AlertCircle className="h-16 w-16 text-muted-foreground opacity-50" />
      <p className="text-lg font-medium text-muted-foreground">{blockMessage}</p>
      <Button variant="outline" onClick={() => navigate('/surveys')}>К списку опросов</Button>
    </div>
  )

  if (submitted) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
      <CheckCircle2 className="h-16 w-16 text-green-500" />
      <h2 className="text-xl font-semibold">Спасибо, ваш ответ записан!</h2>
      <p className="text-muted-foreground">Ваши ответы помогут нам стать лучше.</p>
      <Button variant="outline" onClick={() => navigate('/surveys')}>К списку опросов</Button>
    </div>
  )

  if (!survey) return null

  let errorRefSet = false

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-4">
      <div>
        <h1 className="text-2xl font-bold">{survey.title}</h1>
        {survey.description && <p className="text-muted-foreground mt-1">{survey.description}</p>}
        {survey.deadline && <p className="text-sm text-muted-foreground mt-1">Дедлайн: {formatDate(survey.deadline)}</p>}
      </div>

      {(survey.questions || []).map((q, idx) => {
        const qId = Number(q.id)
        const hasError = errors[qId]
        const isFirstError = hasError && !errorRefSet
        if (isFirstError) errorRefSet = true

        return (
          <div
            key={qId}
            ref={isFirstError ? firstErrorRef : undefined}
            className={`rounded-xl border p-5 transition-colors ${hasError ? 'border-destructive bg-destructive/5' : 'border-border'}`}
          >
            <p className="font-medium mb-1">
              {idx + 1}. {q.text}
              {q.required && <span className="text-destructive ml-1">*</span>}
            </p>
            {hasError && <p className="text-xs text-destructive mb-2">Обязательный вопрос</p>}

            {q.type === 'radio' && (q.options || []).map((opt: string) => (
              <label key={opt} className="flex items-center gap-3 py-1 cursor-pointer">
                <input
                  type="radio"
                  name={`q-${qId}`}
                  value={opt}
                  checked={answers[qId] === opt}
                  onChange={() => setAnswer(qId, opt)}
                  className="accent-primary"
                />
                <span className="text-sm">{opt}</span>
              </label>
            ))}

            {q.type === 'checkbox' && (q.options || []).map((opt: string) => (
              <label key={opt} className="flex items-center gap-3 py-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={((answers[qId] as string[]) || []).includes(opt)}
                  onChange={() => toggleCheckbox(qId, opt)}
                  className="accent-primary rounded"
                />
                <span className="text-sm">{opt}</span>
              </label>
            ))}

            {q.type === 'text' && (
              <textarea
                value={(answers[qId] as string) || ''}
                onChange={(e) => setAnswer(qId, e.target.value)}
                placeholder="Ваш ответ..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none h-24 mt-1"
              />
            )}

            {q.type === 'scale' && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {Array.from({ length: (q.scaleMax ?? 5) - (q.scaleMin ?? 1) + 1 }, (_, i) => String((q.scaleMin ?? 1) + i)).map((v) => (
                  <button
                    key={v}
                    onClick={() => setAnswer(qId, v)}
                    className={`w-10 h-10 rounded-lg border text-sm font-medium transition-colors ${
                      answers[qId] === v
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:border-primary hover:text-primary'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {submitError && <p className="text-destructive text-sm">{submitError}</p>}

      <Button size="lg" onClick={handleSubmit} disabled={submitting} className="w-full">
        {submitting ? 'Отправка...' : 'Отправить ответы'}
      </Button>
    </div>
  )
}
