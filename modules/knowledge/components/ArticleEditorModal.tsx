import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { getErrorMessage } from '@/shared/lib/utils'
import { knowledgeApi } from '@/modules/knowledge/services/knowledgeApi'
import type { KnowledgeArticle, KnowledgeCategory, KnowledgeArticlePayload } from '@/modules/knowledge/types'

interface Props {
  article?: KnowledgeArticle | null
  categories: KnowledgeCategory[]
  onClose: () => void
  onSaved: () => void
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Черновик' },
  { value: 'published', label: 'Опубликовано' },
]

export function ArticleEditorModal({ article, categories, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(article?.title ?? '')
  const [content, setContent] = useState(article?.content ?? '')
  const [categoryId, setCategoryId] = useState<string>(article?.category_id != null ? String(article.category_id) : '')
  const [status, setStatus] = useState(article?.status ?? 'draft')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const categoryOptions = [
    { value: '', label: 'Без категории' },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      setError('Заполните заголовок и текст статьи')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: KnowledgeArticlePayload = {
        title: title.trim(),
        content,
        category_id: categoryId ? Number(categoryId) : null,
        status,
      }
      if (article) {
        await knowledgeApi.updateArticle(article.id, payload)
      } else {
        await knowledgeApi.createArticle(payload)
      }
      onSaved()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <h3 className="font-semibold text-lg">{article ? 'Редактирование статьи' : 'Новая статья'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col gap-4 p-5 overflow-y-auto scrollbar-thin overscroll-contain">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Заголовок статьи"
            maxLength={300}
            autoFocus
          />
          <div className="flex flex-wrap gap-3">
            <SelectDropdown
              options={categoryOptions}
              value={categoryId}
              onChange={setCategoryId}
            />
            <SelectDropdown
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus as (v: string) => void}
            />
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Текст статьи"
            rows={14}
            className="flex-1 min-h-[240px] w-full rounded-xl border border-input bg-background px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15 focus-visible:border-primary/50"
          />
          {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Отмена</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
