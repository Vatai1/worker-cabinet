export interface KnowledgeCategory {
  id: number
  name: string
  sort_order: number
  article_count: number
}

export interface KnowledgeArticleListItem {
  id: number
  category_id: number | null
  category_name: string | null
  title: string
  preview: string
  status: 'draft' | 'published'
  author_name: string | null
  views: number
  created_at: string
  updated_at: string
}

export interface KnowledgeArticle extends Omit<KnowledgeArticleListItem, 'preview'> {
  content: string
  preview?: string
}

export type KnowledgeArticleStatus = 'draft' | 'published'

export interface KnowledgeArticlePayload {
  title: string
  content: string
  category_id: number | null
  status: KnowledgeArticleStatus
}
