import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Button } from '@/shared/components/ui/Button'
import { CheckCircle2, AlertCircle, ClipboardList, ChevronLeft, Clock, Sparkles, ArrowRight } from 'lucide-react'
import { surveyApi } from '@/modules/surveys/services/surveyApi'
import { getErrorMessage, formatDate } from '@/shared/lib/utils'
import type { SurveyWithQuestions } from '@/shared/types'

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
      setSubmitted(true)
    } catch (err: unknown) {
      setSubmitError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-8 animate-fade-in max-w-2xl mx-auto">
        <div className="h-48 rounded-2xl gradient-primary animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    )
  }

  if (blockMessage) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4 animate-fade-in">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/60 mb-2">
        <AlertCircle className="h-7 w-7 text-muted-foreground/40" />
      </div>
      <p className="text-lg font-semibold text-muted-foreground">{blockMessage}</p>
      <Button variant="outline" onClick={() => navigate('/surveys')}>К списку опросов</Button>
    </div>
  )

  if (submitted) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4 animate-fade-in">
      <div className="relative">
        <div className="h-20 w-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        </div>
        <div className="absolute -inset-4 rounded-full bg-emerald-500/5 animate-ping" />
      </div>
      <h2 className="text-xl font-bold">Спасибо, ваш ответ записан!</h2>
      <p className="text-muted-foreground">Ваши ответы помогут нам стать лучше.</p>
      <Button onClick={() => navigate('/surveys')}>К списку опросов</Button>
    </div>
  )

  if (!survey) return null

  let errorRefSet = false
  const totalQuestions = (survey.questions || []).length
  const answeredCount = Object.keys(answers).filter((k) => {
    const v = answers[Number(k)]
    return v && (!Array.isArray(v) || v.length > 0) && v !== ''
  }).length

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <Link to="/surveys" className="inline-block">
        <Button variant="outline" size="sm" className="gap-2 interactive">
          <ChevronLeft className="h-4 w-4" />
          К опросам
        </Button>
      </Link>

      <div className="relative overflow-hidden rounded-2xl gradient-primary p-6 text-white animate-slide-up">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-36 h-36 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-white/60" />
            <span className="text-white/40 text-xs font-medium uppercase tracking-wider">Прохождение опроса</span>
          </div>
          <h1 className="text-xl lg:text-2xl font-extrabold tracking-tight">{survey.title}</h1>
          {survey.description && <p className="mt-1.5 text-white/55 text-sm">{survey.description}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/10 border border-white/10 text-white/80">
              <ClipboardList className="h-3 w-3 text-white/50" />
              {totalQuestions} {totalQuestions === 1 ? 'вопрос' : totalQuestions < 5 ? 'вопроса' : 'вопросов'}
            </span>
            {survey.deadline && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/10 border border-white/10 text-white/80">
                <Clock className="h-3 w-3 text-white/50" />
                До {formatDate(survey.deadline)}
              </span>
            )}
          </div>
          {totalQuestions > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-white/50 mb-1.5">
                <span>Прогресс</span>
                <span>{answeredCount} из {totalQuestions}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white/60 transition-all duration-500"
                  style={{ width: `${totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {(survey.questions || []).map((q, idx) => {
        const qId = Number(q.id)
        const hasError = errors[qId]
        const isFirstError = hasError && !errorRefSet
        if (isFirstError) errorRefSet = true
        const staggerClass = idx < 8 ? `stagger-${idx + 1}` : 'stagger-8'

        return (
          <div
            key={qId}
            ref={isFirstError ? firstErrorRef : undefined}
            className={`rounded-2xl border bg-card p-5 transition-all duration-200 animate-slide-up ${staggerClass} ${
              hasError ? 'border-destructive/50 bg-destructive/5' : 'border-border/60'
            }`}
          >
            <p className="font-bold text-[15px] mb-3">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-lg bg-primary/10 text-primary text-xs font-bold mr-2">
                {idx + 1}
              </span>
              {q.text}
              {q.required && <span className="text-destructive ml-1">*</span>}
            </p>
            {hasError && <p className="text-xs text-destructive mb-3 ml-8">Обязательный вопрос</p>}

            {q.type === 'radio' && (
              <div className="space-y-1.5 ml-8">
                {(q.options || []).map((opt: string) => (
                  <label
                    key={opt}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 ${
                      answers[qId] === opt
                        ? 'bg-primary/10 border border-primary/20 text-primary font-medium'
                        : 'hover:bg-muted/50 border border-transparent'
                    }`}
                  >
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      answers[qId] === opt ? 'border-primary' : 'border-muted-foreground/30'
                    }`}>
                      {answers[qId] === opt && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    <span className="text-sm">{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {q.type === 'checkbox' && (
              <div className="space-y-1.5 ml-8">
                {(q.options || []).map((opt: string) => {
                  const isChecked = ((answers[qId] as string[]) || []).includes(opt)
                  return (
                  <label
                    key={opt}
                    onClick={() => toggleCheckbox(qId, opt)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 ${
                      isChecked
                        ? 'bg-primary/10 border border-primary/20 text-primary font-medium'
                        : 'hover:bg-muted/50 border border-transparent'
                    }`}
                  >
                    <div className={`h-4 w-4 rounded-md border-2 flex items-center justify-center transition-colors ${
                      isChecked ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                    }`}>
                      {isChecked && (
                        <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm">{opt}</span>
                  </label>
                  )
                })}
              </div>
            )}

            {q.type === 'text' && (
              <div className="ml-8">
                <textarea
                  value={(answers[qId] as string) || ''}
                  onChange={(e) => setAnswer(qId, e.target.value)}
                  placeholder="Ваш ответ..."
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm resize-none h-24 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
                />
              </div>
            )}

            {q.type === 'scale' && (
              <div className="flex gap-2 mt-1 flex-wrap ml-8">
                {Array.from({ length: (q.scaleMax ?? 5) - (q.scaleMin ?? 1) + 1 }, (_, i) => String((q.scaleMin ?? 1) + i)).map((v) => (
                  <button
                    key={v}
                    onClick={() => setAnswer(qId, v)}
                    className={`h-10 w-10 rounded-xl text-sm font-bold transition-all duration-150 ${
                      answers[qId] === v
                        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25 scale-110'
                        : 'border border-border hover:border-primary hover:text-primary hover:bg-primary/5'
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

      <Button size="lg" onClick={handleSubmit} disabled={submitting} className="w-full text-base font-bold">
        {submitting ? 'Отправка...' : 'Отправить ответы'}
        {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}
      </Button>
    </div>
  )
}
