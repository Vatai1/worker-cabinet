import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Badge } from '@/shared/components/ui/Badge'
import { OnlyOfficePreviewModal } from '@/shared/components/OnlyOfficePreviewModal'
import { CheckCircle2, Circle, FileText, Download, Loader2, BookOpen, Eye, ClipboardCheck, Sparkles } from 'lucide-react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { getErrorMessage, formatDate } from '@/shared/lib/utils'

interface OnboardingDocument {
  id: number
  templateId: number
  title: string
  contentText: string | null
  fileKey: string | null
  fileUrl: string | null
  mimeType: string
  acknowledgedAt: string | null
}

interface OnboardingData {
  id: number
  userId: number
  startedAt: string
  firstName: string
  lastName: string
  position: string
  documents: OnboardingDocument[]
}

export function Onboarding() {
  const navigate = useNavigate()
  const { checkAuth } = useAuthStore()
  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState<OnboardingDocument | null>(null)
  const [confirmDocId, setConfirmDocId] = useState<number | null>(null)
  const [acknowledging, setAcknowledging] = useState(false)
  const [ackError, setAckError] = useState<string | null>(null)
  const [onlyOfficeDoc, setOnlyOfficeDoc] = useState<{
    id: number
    name: string
    url: string
    mimeType: string
    acknowledged: boolean
  } | null>(null)

  const fetchOnboarding = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/onboarding/me`, { headers: getAuthHeaders() })
      if (res.status === 404) {
        await checkAuth()
        navigate('/dashboard', { replace: true })
        return
      }
      if (!res.ok) throw new Error('Ошибка загрузки')
      const data = await res.json()
      setOnboarding(data)
    } catch {
      navigate('/dashboard', { replace: true })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchOnboarding() }, [])

  const handleAcknowledge = async () => {
    if (!confirmDocId) return
    setAcknowledging(true)
    setAckError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/onboarding/me/documents/${confirmDocId}/acknowledge`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка')
      }
      await checkAuth()
      const updatedUser = useAuthStore.getState().user
      if (updatedUser?.role === 'employee') {
        navigate('/dashboard', { replace: true })
        return
      }
      setSelectedDoc(null)
      setConfirmDocId(null)
      await fetchOnboarding()
    } catch (err: unknown) {
      setAckError(getErrorMessage(err))
    } finally {
      setAcknowledging(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (!onboarding) return null

  const total = onboarding.documents.length
  const acknowledged = onboarding.documents.filter(d => d.acknowledgedAt).length
  const percent = total > 0 ? Math.round((acknowledged / total) * 100) : 0

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-8 text-white animate-slide-up">
        <div className="absolute top-0 right-0 w-64 h-64 bg-card/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-card/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-white/70" />
            <span className="text-xs font-medium text-white/60 uppercase tracking-wider">Онбординг</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Онбординг</h1>
          <p className="mt-2 text-white/50 text-sm">Добро пожаловать, {onboarding.firstName} {onboarding.lastName}! Ознакомьтесь с документами</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-6">
          <div className="flex items-center gap-1.5 rounded-lg bg-card/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
            <ClipboardCheck className="h-3.5 w-3.5" />{acknowledged} из {total} документов
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-card/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
            {percent}% выполнено
          </div>
        </div>
      </div>

      <Card className="section-card stagger-1">
        <CardHeader>
          <CardTitle className="text-lg">Прогресс</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>Ознакомлено документов: <strong>{acknowledged} из {total}</strong></span>
            <span className="font-semibold text-primary">{percent}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Документы</h2>
        {onboarding.documents.map((doc, index) => {
          const staggerClass = index < 8 ? `stagger-${index + 1}` : 'stagger-8'
          return (
            <Card key={doc.id} className={`section-card ${staggerClass}`}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="shrink-0">
                  {doc.acknowledgedAt
                    ? <CheckCircle2 className="h-6 w-6 text-green-500" />
                    : <Circle className="h-6 w-6 text-muted-foreground" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{doc.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {doc.contentText && <Badge variant="secondary" className="text-xs">Текст</Badge>}
                    {doc.fileKey && <Badge variant="secondary" className="text-xs"><FileText className="h-3 w-3 mr-1" />Файл</Badge>}
                    {doc.acknowledgedAt && (
                      <span className="text-xs text-muted-foreground">Ознакомлен {formatDate(doc.acknowledgedAt)}</span>
                    )}
                  </div>
                </div>
                {!doc.acknowledgedAt && (
                  <Button size="sm" variant="outline" onClick={() => setSelectedDoc(doc)}>
                    <BookOpen className="h-4 w-4 mr-2" />
                    Открыть
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {selectedDoc && !confirmDocId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-border/50">
              <h3 className="text-lg font-semibold">{selectedDoc.title}</h3>
              <button onClick={() => setSelectedDoc(null)} className="interactive text-muted-foreground hover:text-foreground transition-colors">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {selectedDoc.contentText && (
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{selectedDoc.contentText}</div>
              )}
              {selectedDoc.fileUrl && (
                <div className="flex gap-3 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await fetch(`${API_BASE_URL}/onboarding/documents/${selectedDoc.id}/access-token`, {
                          method: 'POST',
                          headers: getAuthHeaders(),
                        })
                        if (!res.ok) {
                          const error = await res.json()
                          throw new Error(error.error || 'Ошибка получения токена')
                        }
                        const { accessToken } = await res.json()
                        const fileUrl = `${API_BASE_URL}/onboarding/documents/${selectedDoc.id}/file?token=${accessToken}`
                          .replace('localhost:5000', 'host.docker.internal:5000')
                        setSelectedDoc(null)
                        setOnlyOfficeDoc({
                          id: selectedDoc.id,
                          name: selectedDoc.title,
                          url: fileUrl,
                          mimeType: selectedDoc.mimeType,
                          acknowledged: selectedDoc.acknowledgedAt !== null,
                        })
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Неизвестная ошибка')
                      }
                    }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Открыть в OnlyOffice
                  </Button>
                  <a
                    href={selectedDoc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="interactive inline-flex items-center gap-2 text-primary hover:underline text-sm"
                  >
                    <Download className="h-4 w-4" />
                    Скачать файл
                  </a>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-border/50 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setSelectedDoc(null)}>Закрыть</Button>
              <Button onClick={() => setConfirmDocId(selectedDoc.id)}>Ознакомлен</Button>
            </div>
          </div>
        </div>
      )}

      {confirmDocId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 space-y-4 animate-scale-in">
            <h3 className="text-lg font-semibold">Подтверждение</h3>
            <p className="text-muted-foreground">Вы подтверждаете ознакомление с документом?</p>
            {ackError && <p className="text-sm text-destructive">{ackError}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setConfirmDocId(null); setAckError(null) }} disabled={acknowledging}>
                Отмена
              </Button>
              <Button onClick={handleAcknowledge} disabled={acknowledging}>
                {acknowledging ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Подтвердить
              </Button>
            </div>
          </div>
        </div>
      )}

      {onlyOfficeDoc && (
        <OnlyOfficePreviewModal
          open={!!onlyOfficeDoc}
          onClose={() => setOnlyOfficeDoc(null)}
          document={onlyOfficeDoc}
          editable={false}
          acknowledged={onlyOfficeDoc.acknowledged}
          onAcknowledge={async () => {
            try {
              const res = await fetch(`${API_BASE_URL}/onboarding/me/documents/${onlyOfficeDoc.id}/acknowledge`, {
                method: 'POST',
                headers: getAuthHeaders(),
              })
              if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Ошибка')
              }
              await checkAuth()
              const updatedUser = useAuthStore.getState().user
              if (updatedUser?.role === 'employee') {
                navigate('/dashboard', { replace: true })
                return
              }
              await fetchOnboarding()
            } catch (err) {
              throw err
            }
          }}
        />
      )}
    </div>
  )
}
