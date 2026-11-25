import { apiGet, apiPost, apiPut, apiDelete } from '@/shared/lib/apiClient'
import type {
  KnowledgeArticle,
  KnowledgeArticleListItem,
  KnowledgeArticlePayload,
  KnowledgeArticleStatus,
  KnowledgeCategory,
} from '@/modules/knowledge/types'

export interface ArticleListParams {
  q?: string
  category?: number | 'none'
  status?: KnowledgeArticleStatus
  page?: number
  limit?: number
}

function buildQuery(params: ArticleListParams): string {
  const search = new URLSearchParams()
  if (params.q?.trim()) search.set('q', params.q.trim())
  if (params.category !== undefined) search.set('category', String(params.category))
  if (params.status) search.set('status', params.status)
  if (params.page) search.set('page', String(params.page))
  if (params.limit) search.set('limit', String(params.limit))
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export const knowledgeApi = {
  listCategories(): Promise<KnowledgeCategory[]> {
    return apiGet<KnowledgeCategory[]>('/knowledge/categories')
  },

  createCategory(name: string): Promise<KnowledgeCategory> {
    return apiPost<KnowledgeCategory>('/knowledge/categories', { name })
  },

  renameCategory(id: number, name: string): Promise<KnowledgeCategory> {
    return apiPut<KnowledgeCategory>(`/knowledge/categories/${id}`, { name })
  },

  deleteCategory(id: number): Promise<void> {
    return apiDelete(`/knowledge/categories/${id}`)
  },

  listArticles(params: ArticleListParams = {}): Promise<KnowledgeArticleListItem[]> {
    return apiGet<KnowledgeArticleListItem[]>(`/knowledge/articles${buildQuery(params)}`)
  },

  getArticle(id: number | string): Promise<KnowledgeArticle> {
    return apiGet<KnowledgeArticle>(`/knowledge/articles/${id}`)
  },

  createArticle(payload: KnowledgeArticlePayload): Promise<KnowledgeArticle> {
    return apiPost<KnowledgeArticle>('/knowledge/articles', payload)
  },

  updateArticle(id: number, payload: Partial<KnowledgeArticlePayload>): Promise<KnowledgeArticle> {
    return apiPut<KnowledgeArticle>(`/knowledge/articles/${id}`, payload)
  },

  deleteArticle(id: number): Promise<void> {
    return apiDelete(`/knowledge/articles/${id}`)
  },
}
