import { useState, useEffect } from 'react'
import { formatFileSize } from '@/data/mockData'
import type { Document } from '@/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DocumentPreviewModal } from '@/components/modals/DocumentPreviewModal'
import { isPreviewable } from '@/lib/documentUtils'
import { formatDate } from '@/lib/utils'
import { FileText, Download, Search, Upload, Eye, Folder } from 'lucide-react'
import { Input } from '@/components/ui/Input'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'

const getAuthHeaders = () => {
  const authStorage = localStorage.getItem('auth-storage')
  const headers: Record<string, string> = {}
  if (authStorage) {
    try {
      const { state } = JSON.parse(authStorage)
      if (state?.token) headers['Authorization'] = `Bearer ${state.token}`
    } catch {}
  }
  return headers
}

interface ApiDocument {
  id: string
  name: string
  url: string
  size: number
  mimeType: string
  projectId: string
  projectName: string
  uploader: string
  uploadedAt: string
  description?: string
  tags?: string[]
}

type DocumentType = 'all' | 'contract' | 'nda' | 'policy' | 'certificate' | 'other'

export function Documents() {
  const [filterType, setFilterType] = useState<DocumentType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [documents, setDocuments] = useState<Document[]>([])
  const [apiDocuments, setApiDocuments] = useState<ApiDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null)

  const fetchDocuments = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE_URL}/documents`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Не удалось загрузить документы')
      const data = await res.json()
      setApiDocuments(data)
      const docs = data.map((doc: ApiDocument) => ({
        id: doc.id,
        name: doc.name,
        url: doc.url,
        size: doc.size,
        mimeType: doc.mimeType,
        type: 'other' as Document['type'],
        uploadDate: doc.uploadedAt,
      }))
      setDocuments(docs)
    } catch (err: any) {
      console.error('Error fetching documents:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [])

  const filteredDocuments = documents.filter((doc) => {
    const matchesType = filterType === 'all' || doc.type === filterType
    const matchesSearch = searchQuery === '' ||
      doc.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesType && matchesSearch
  })

  const getDocumentTypeBadge = (type: Document['type']) => {
    const badges = {
      contract: { label: 'Договор', className: 'bg-blue-100 text-blue-800' },
      nda: { label: 'NDA', className: 'bg-purple-100 text-purple-800' },
      policy: { label: 'Политика', className: 'bg-green-100 text-green-800' },
      certificate: { label: 'Сертификат', className: 'bg-yellow-100 text-yellow-800' },
      other: { label: 'Другое', className: 'bg-gray-100 text-gray-800' },
    }
    return badges[type]
  }

  const getMimeType = (type: Document['type']) => {
    const mimeTypes = {
      contract: 'application/pdf',
      nda: 'application/pdf',
      policy: 'application/pdf',
      certificate: 'application/pdf',
      other: 'application/octet-stream',
    }
    return mimeTypes[type]
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Документы</h1>
          <p className="text-muted-foreground">
            Доступ к вашим трудовым и личным документам
          </p>
        </div>
        <Button>
          <Upload className="mr-2 h-4 w-4" />
          Загрузить документ
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Поиск документов..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={filterType === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('all')}
              >
                Все
              </Button>
              <Button
                variant={filterType === 'contract' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('contract')}
              >
                Договоры
              </Button>
              <Button
                variant={filterType === 'certificate' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('certificate')}
              >
                Сертификаты
              </Button>
              <Button
                variant={filterType === 'policy' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('policy')}
              >
                Политики
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Documents grid */}
      {loading ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground animate-pulse" />
              <p className="mt-4 text-lg font-medium">Загрузка документов...</p>
            </div>
          </CardContent>
        </Card>
      ) : filteredDocuments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-20" />
              <p className="mt-4 text-lg font-medium">Документы не найдены</p>
              <p className="text-sm text-muted-foreground">
                {searchQuery || filterType !== 'all'
                  ? 'Попробуйте изменить параметры поиска или фильтры'
                  : 'У вас пока нет документов'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredDocuments.map((doc) => {
            const typeBadge = getDocumentTypeBadge(doc.type)
            const apiDoc = apiDocuments.find((d) => d.id === doc.id)
            
            return (
              <Card key={doc.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base line-clamp-1">
                        {doc.name}
                      </CardTitle>
                      <CardDescription>
                        {formatFileSize(doc.size)}
                      </CardDescription>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {apiDoc?.projectName && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Folder className="h-3 w-3" />
                        {apiDoc.projectName}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <Badge className={typeBadge.className} variant="secondary">
                        {typeBadge.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(doc.uploadDate)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {isPreviewable(doc.mimeType || getMimeType(doc.type), doc.name) && (
                        <Button className="flex-1" variant="outline" size="sm" onClick={() => setPreviewDoc(doc)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Просмотр
                        </Button>
                      )}
                      <a
                        href={`${API_BASE_URL}/projects/${apiDoc?.projectId}/documents/${doc.id}/download`}
                        className="flex-1"
                      >
                        <Button className="w-full" variant="outline" size="sm">
                          <Download className="mr-2 h-4 w-4" />
                          Скачать
                        </Button>
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Всего документов</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documents.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Договоры</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documents.filter((d) => d.type === 'contract').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Сертификаты</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documents.filter((d) => d.type === 'certificate').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Общий размер</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatFileSize(documents.reduce((acc, doc) => acc + doc.size, 0))}
            </div>
          </CardContent>
        </Card>
      </div>
      {previewDoc && (
        <DocumentPreviewModal
          open={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          document={{
            id: previewDoc.id,
            name: previewDoc.name,
            mimeType: previewDoc.mimeType || getMimeType(previewDoc.type),
            url: async () => {
              const apiDoc = apiDocuments.find((d) => d.id === previewDoc.id)
              
              if (!apiDoc) {
                throw new Error('Document not found')
              }
              
              // For DOCX files, get preview token and use public URL for OnlyOffice
              if (apiDoc.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                  apiDoc.mimeType === 'application/msword' ||
                  previewDoc.name.toLowerCase().endsWith('.docx')) {
                console.log('📄 Detected DOCX file, getting preview token...')
                const tokenRes = await fetch(
                  `${API_BASE_URL}/projects/${apiDoc.projectId}/documents/${previewDoc.id}/preview-token`,
                  { headers: getAuthHeaders() }
                )

                console.log('Token response status:', tokenRes.status)

                if (!tokenRes.ok) {
                  const errorData = await tokenRes.text()
                  console.error('❌ Failed to get token:', errorData)
                  throw new Error('Не удалось получить токен')
                }

                const data = await tokenRes.json()
                const publicUrl = data.publicUrl || `${API_BASE_URL}/projects/${apiDoc.projectId}/documents/${previewDoc.id}/public/${data.token}`
                console.log('✅ Got public URL:', publicUrl.substring(0, 80) + '...')

                return publicUrl
              }

              const res = await fetch(
                `${API_BASE_URL}/projects/${apiDoc.projectId}/documents/${previewDoc.id}/preview`,
                { headers: getAuthHeaders() }
              )
              if (!res.ok) throw new Error('Не удалось загрузить файл')
              
              const contentType = res.headers.get('content-type') || ''
              
              if (contentType.includes('text/plain') || contentType.includes('text/html')) {
                const text = await res.text()
                return text
              }
              
              const blob = await res.blob()
              return window.URL.createObjectURL(blob)
            },
            size: previewDoc.size,
            projectId: apiDocuments.find((d) => d.id === previewDoc.id)?.projectId,
          }}
        />
      )}
    </div>
  )
}
