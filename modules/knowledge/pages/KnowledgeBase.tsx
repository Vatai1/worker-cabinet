import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookMarked, Eye, FileText, FolderTree, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Badge } from '@/shared/components/ui/Badge'
import { Card, CardContent } from '@/shared/components/ui/Card'
import { SelectDropdown } from '@/shared/components/ui/SelectDropdown'
import { PageBanner } from '@/shared/components/PageBanner'
import { useCan } from '@/shared/lib/permissions'
import { formatDateTime, getErrorMessage, cn } from '@/shared/lib/utils'
import { knowledgeApi } from '@/modules/knowledge/services/knowledgeApi'
import { ArticleEditorModal } from '@/modules/knowledge/components/ArticleEditorModal'
import type { KnowledgeArticle, KnowledgeArticleListItem, KnowledgeCategory } from '@/modules/knowledge/types'

type CategoryFilter = 'all' | 'none' | number

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Все по статусу' },
  { value: 'published', label: 'Опубликованные' },
  { value: 'draft', label: 'Черновики' },
]

export function KnowledgeBase() {
  const navigate = useNavigate()
  const canManage = useCan('knowledge:manage')

  const [categories, setCategories] = useState<KnowledgeCategory[]>([])
  const [articles, setArticles] = useState<KnowledgeArticleListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all')

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingArticle, setEditingArticle] = useState<KnowledgeArticle | null>(null)

  const [newCategory, setNewCategory] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [categoryBusy, setCategoryBusy] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(timer)
  }, [search])

  const fetchCategories = useCallback(async () => {
    try {
      setCategories(await knowledgeApi.listCategories())
    } catch {}
  }, [])

  const fetchArticles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setArticles(await knowledgeApi.listArticles({
        q: debouncedSearch || undefined,
        category: activeCategory === 'all' ? undefined : activeCategory,
        status: canManage && statusFilter !== 'all' ? statusFilter : undefined,
      }))
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, activeCategory, statusFilter, canManage])

  useEffect(() => { fetchCategories() }, [fetchCategories])
  useEffect(() => { fetchArticles() }, [fetchArticles])

  const openCreate = () => {
    setEditingArticle(null)
    setEditorOpen(true)
  }

  const openEdit = async (id: number) => {
    try {
      setEditingArticle(await knowledgeApi.getArticle(id))
      setEditorOpen(true)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }

  const addCategory = async () => {
    if (!newCategory.trim() || categoryBusy) return
    setCategoryBusy(true)
    try {
      await knowledgeApi.createCategory(newCategory.trim())
      setNewCategory('')
      await fetchCategories()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setCategoryBusy(false)
    }
  }

  const saveCategoryRename = async () => {
    if (editingCategoryId == null || !editingCategoryName.trim() || categoryBusy) return
    setCategoryBusy(true)
    try {
      await knowledgeApi.renameCategory(editingCategoryId, editingCategoryName.trim())
      setEditingCategoryId(null)
      await Promise.all([fetchCategories(), fetchArticles()])
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setCategoryBusy(false)
    }
  }

  const removeCategory = async (category: KnowledgeCategory) => {
    if (!window.confirm(`Удалить категорию «${category.name}»? Статьи останутся без категории.`)) return
    setCategoryBusy(true)
    try {
      await knowledgeApi.deleteCategory(category.id)
      if (activeCategory === category.id) setActiveCategory('all')
      await Promise.all([fetchCategories(), fetchArticles()])
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setCategoryBusy(false)
    }
  }

  const publishedTotal = categories.reduce((sum, c) => sum + c.article_count, 0)

  const categoryButtonClass = (active: boolean) => cn(
    'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm transition-colors text-left',
    active ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground/80',
  )

  return (
    <div className="space-y-6">
      <PageBanner
        icon={BookMarked}
        eyebrow="Справочник"
        title="База знаний"
        subtitle="Регламенты, инструкции и ответы на частые вопросы"
        aside={canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Написать статью
          </Button>
        )}
      />

      {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-64 shrink-0 space-y-1.5">
          <button onClick={() => setActiveCategory('all')} className={categoryButtonClass(activeCategory === 'all')}>
            <span className="flex items-center gap-2 min-w-0">
              <FolderTree className="h-4 w-4 shrink-0" />
              <span className="truncate">Все статьи</span>
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">{publishedTotal}</span>
          </button>

          {categories.map((category) => (
            editingCategoryId === category.id ? (
              <div key={category.id} className="flex gap-1.5 px-1">
                <Input
                  value={editingCategoryName}
                  onChange={(e) => setEditingCategoryName(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveCategoryRename()
                    if (e.key === 'Escape') setEditingCategoryId(null)
                  }}
                />
                <Button size="sm" onClick={saveCategoryRename} disabled={categoryBusy || !editingCategoryName.trim()}>ОК</Button>
              </div>
            ) : (
              <div
                key={category.id}
                className={cn(
                  'group flex items-center gap-1 rounded-xl transition-colors',
                  activeCategory === category.id && 'bg-primary/10',
                )}
              >
                <button
                  onClick={() => setActiveCategory(category.id)}
                  className={cn(categoryButtonClass(activeCategory === category.id), 'flex-1 rounded-r-none')}
                >
                  <span className="truncate">{category.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{category.article_count}</span>
                </button>
                {canManage && (
                  <span className="flex shrink-0 pr-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      title="Переименовать"
                      onClick={() => { setEditingCategoryId(category.id); setEditingCategoryName(category.name) }}
                      className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      title="Удалить"
                      onClick={() => removeCategory(category)}
                      className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
            )
          ))}

          <button onClick={() => setActiveCategory('none')} className={categoryButtonClass(activeCategory === 'none')}>
            <span className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">Без категории</span>
            </span>
          </button>

          {canManage && (
            <div className="pt-3 mt-2 border-t border-border">
              <div className="flex gap-2">
                <Input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Новая категория"
                  className="h-9 text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter') addCategory() }}
                />
                <Button size="icon" variant="outline" onClick={addCategory} disabled={!newCategory.trim() || categoryBusy} title="Добавить категорию">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </aside>

        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по заголовкам и тексту статей…"
                className="pl-10"
              />
            </div>
            {canManage && (
              <SelectDropdown
                options={STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as 'all' | 'published' | 'draft')}
              />
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : articles.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center space-y-2">
                <BookMarked className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <p className="font-medium">Статьи не найдены</p>
                <p className="text-sm text-muted-foreground">
                  {debouncedSearch || activeCategory !== 'all'
                    ? 'Попробуйте изменить поисковый запрос или категорию'
                    : canManage
                      ? 'Нажмите «Написать статью», чтобы создать первую'
                      : 'Здесь появятся регламенты и инструкции'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {articles.map((article) => (
                <Card
                  key={article.id}
                  onClick={() => navigate(`/knowledge/${article.id}`)}
                  className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group"
                >
                  <CardContent className="p-5 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                        {article.title}
                      </h3>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {article.status === 'draft' && <Badge variant="warning">Черновик</Badge>}
                        {canManage && (
                          <button
                            title="Редактировать"
                            onClick={(e) => { e.stopPropagation(); openEdit(article.id) }}
                            className="p-1 rounded-md text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground transition-all"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-line">{article.preview}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground pt-0.5">
                      {article.category_name && <Badge variant="secondary">{article.category_name}</Badge>}
                      {article.author_name && <span className="truncate">{article.author_name}</span>}
                      <span>{formatDateTime(article.updated_at)}</span>
                      <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{article.views}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {editorOpen && (
        <ArticleEditorModal
          article={editingArticle}
          categories={categories}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            setEditorOpen(false)
            fetchArticles()
            fetchCategories()
          }}
        />
      )}
    </div>
  )
}
