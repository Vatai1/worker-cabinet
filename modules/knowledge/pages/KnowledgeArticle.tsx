import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Eye, Loader2, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Badge } from '@/shared/components/ui/Badge'
import { Card, CardContent } from '@/shared/components/ui/Card'
import { useCan } from '@/shared/lib/permissions'
import { formatDateTime, getErrorMessage } from '@/shared/lib/utils'
import { knowledgeApi } from '@/modules/knowledge/services/knowledgeApi'
import { ArticleEditorModal } from '@/modules/knowledge/components/ArticleEditorModal'
import type { KnowledgeArticle, KnowledgeCategory } from '@/modules/knowledge/types'

export function KnowledgeArticlePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const canManage = useCan('knowledge:manage')

  const [article, setArticle] = useState<KnowledgeArticle | null>(null)
  const [categories, setCategories] = useState<KnowledgeCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  const fetchArticle = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      setArticle(await knowledgeApi.getArticle(id))
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchArticle() }, [fetchArticle])
  useEffect(() => {
    if (!canManage) return
    knowledgeApi.listCategories().then(setCategories).catch(() => {})
  }, [canManage])

  const removeArticle = async () => {
    if (!article || !window.confirm(`Удалить статью «${article.title}»?`)) return
    try {
      await knowledgeApi.deleteArticle(article.id)
      navigate('/knowledge')
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (error || !article) {
    return (
      <Card>
        <CardContent className="p-10 text-center space-y-3">
          <p className="text-destructive">{error ?? 'Статья не найдена'}</p>
          <Link to="/knowledge" className="inline-flex">
            <Button variant="outline"><ArrowLeft className="h-4 w-4" />К базе знаний</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link to="/knowledge" className="inline-flex">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" />К базе знаний</Button>
        </Link>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)}>
              <Pencil className="h-4 w-4" />
              Редактировать
            </Button>
            <Button variant="destructive" size="sm" onClick={removeArticle}>
              <Trash2 className="h-4 w-4" />
              Удалить
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-6 lg:p-8 space-y-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {article.category_name && <Badge variant="secondary">{article.category_name}</Badge>}
              {article.status === 'draft' && <Badge variant="warning">Черновик</Badge>}
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold leading-tight">{article.title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {article.author_name && <span>{article.author_name}</span>}
              <span>Обновлено {formatDateTime(article.updated_at)}</span>
              <span className="flex items-center gap-1.5"><Eye className="h-4 w-4" />{article.views}</span>
            </div>
          </div>
          <div className="h-px bg-border" />
          <article className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {article.content}
          </article>
        </CardContent>
      </Card>

      {editorOpen && (
        <ArticleEditorModal
          article={article}
          categories={categories}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            setEditorOpen(false)
            fetchArticle()
          }}
        />
      )}
    </div>
  )
}
