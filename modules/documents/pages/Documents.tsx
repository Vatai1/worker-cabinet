import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Badge } from '@/shared/components/ui/Badge'
import { Input } from '@/shared/components/ui/Input'
import { FileText, Download, Search, Upload, Eye, X, Trash2, FolderOpen, FileX } from 'lucide-react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { formatFileSize } from '@/shared/data/mockData'
import { formatDate, getErrorMessage } from '@/shared/lib/utils'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'

interface UserDocument {
  id: string
  name: string
  url: string
  size: number
  mimeType: string
  category: string
  uploadedAt: string
  description?: string
}

type DocumentType = 'all' | 'contract' | 'certificate' | 'policy' | 'other'

export function Documents() {
  const { user } = useAuthStore()
  const [filterType, setFilterType] = useState<DocumentType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [documents, setDocuments] = useState<UserDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadCategory, setUploadCategory] = useState<string>('other')
  const [uploadDescription, setUploadDescription] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDocuments = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE_URL}/user-documents`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setDocuments(data)
      } else {
        setDocuments([])
      }
    } catch (err: unknown) {
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [])

  const filteredDocuments = documents.filter((doc) => {
    const matchesType = filterType === 'all' || doc.category === filterType
    const matchesSearch = searchQuery === '' ||
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesType && matchesSearch
  })

  const getCategoryBadge = (category: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      contract: { label: 'Договор', className: 'bg-blue-100 text-blue-800' },
      certificate: { label: 'Сертификат', className: 'bg-yellow-100 text-yellow-800' },
      policy: { label: 'Политика', className: 'bg-green-100 text-green-800' },
      other: { label: 'Другое', className: 'bg-muted text-muted-foreground' },
    }
    return badges[category] || badges.other
  }

  const handleDownload = async (doc: UserDocument) => {
    try {
      const res = await fetch(`${API_BASE_URL}/user-documents/${doc.id}/download`, {
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error('Ошибка скачивания')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.name
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()
    } catch (error) {
      toast.error('Не удалось скачать файл')
    }
  }

  const handlePreview = async (doc: UserDocument) => {
    try {
      const res = await fetch(`${API_BASE_URL}/user-documents/${doc.id}/preview`, {
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error('Ошибка предпросмотра')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (error) {
      toast.error('Не удалось открыть файл для просмотра')
    }
  }

  const handleDelete = async (doc: UserDocument) => {
    if (!await confirmDialog({ title: 'Удаление документа', message: `Удалить документ "${doc.name}"?`, confirmText: 'Удалить', variant: 'danger' })) return

    try {
      const res = await fetch(`${API_BASE_URL}/user-documents/${doc.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error('Ошибка удаления')

      setDocuments(prev => prev.filter(d => d.id !== doc.id))
    } catch (error) {
      toast.error('Не удалось удалить документ')
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('category', uploadCategory)
      formData.append('description', uploadDescription)

      const res = await fetch(`${API_BASE_URL}/user-documents`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка загрузки')
      }

      const newDoc = await res.json()
      setDocuments(prev => [newDoc, ...prev])
      setUploadModalOpen(false)
      setSelectedFile(null)
      setUploadCategory('other')
      setUploadDescription('')
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || 'Не удалось загрузить документ')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-8 text-white animate-slide-up">
        <div className="absolute top-0 right-0 w-64 h-64 bg-card/5 rounded-full -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-card/5 rounded-full translate-y-1/3 -translate-x-1/3" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-card/3 rounded-full blur-2xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-5 w-5 text-white/70" />
            <span className="text-xs font-medium text-white/60 uppercase tracking-wider">Документы</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Документы</h1>
          <p className="mt-2 text-white/50 text-sm">Личные документы: договоры, сертификаты и другие файлы</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-6">
          <div className="flex items-center gap-1.5 rounded-lg bg-card/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
            <FileText className="h-3.5 w-3.5" />
            {documents.length} документов
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-card/10 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
            <FolderOpen className="h-3.5 w-3.5" />
            {new Set(documents.map(d => d.category)).size} категорий
          </div>
          {user?.role === 'manager' && (
            <button
              onClick={() => setUploadModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-card/10 text-white hover:bg-card/20 px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <Upload className="h-3.5 w-3.5" />
              Загрузить документ
            </button>
          )}
        </div>
      </div>

      <Card className="section-card stagger-1">
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
                variant={filterType === 'other' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('other')}
              >
                Другое
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card className="section-card stagger-2">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground animate-pulse" />
              <div className="mt-4 space-y-3">
                <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
                <div className="h-24 w-full rounded-lg bg-muted animate-pulse" />
                <div className="h-24 w-full rounded-lg bg-muted animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : filteredDocuments.length === 0 ? (
        <Card className="section-card stagger-2">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-20" />
              <div className="mt-4 flex flex-col items-center py-12 text-muted-foreground">
                <FileX className="h-12 w-12 mb-3 opacity-50" />
                <p className="text-lg font-medium">Документы не найдены</p>
                <p className="text-sm mt-1">Попробуйте изменить фильтры или загрузить новый документ</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {searchQuery || filterType !== 'all'
                  ? 'Попробуйте изменить параметры поиска или фильтры'
                  : 'У вас пока нет загруженных документов'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="page-grid">
          {filteredDocuments.map((doc, index) => {
            const categoryBadge = getCategoryBadge(doc.category)
            const staggerClass = index < 8 ? `stagger-${index + 1}` : 'stagger-8'

            return (
              <Card key={doc.id} className={`section-card hover-lift ${staggerClass}`}>
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
                    {doc.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {doc.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <Badge className={categoryBadge.className} variant="secondary">
                        {categoryBadge.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(doc.uploadedAt)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        variant="outline"
                        size="sm"
                        onClick={() => handlePreview(doc)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Просмотр
                      </Button>
                      <Button
                        className="flex-1"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(doc)}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Скачать
                      </Button>
                    </div>
                    {user?.role === 'manager' && (
                      <Button
                        className="w-full"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(doc)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Удалить
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="page-grid">
        <Card className="section-card stagger-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Всего документов</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documents.length}</div>
          </CardContent>
        </Card>
        <Card className="section-card stagger-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Договоры</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documents.filter((d) => d.category === 'contract').length}
            </div>
          </CardContent>
        </Card>
        <Card className="section-card stagger-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Сертификаты</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documents.filter((d) => d.category === 'certificate').length}
            </div>
          </CardContent>
        </Card>
        <Card className="section-card stagger-4">
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

      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="section-card w-full max-w-md mx-4 animate-scale-in">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Загрузить документ</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setUploadModalOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Файл</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  className="mt-1 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
                {selectedFile && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium">Категория</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="contract">Договор</option>
                  <option value="certificate">Сертификат</option>
                  <option value="policy">Политика</option>
                  <option value="other">Другое</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Описание</label>
                <Input
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="Описание документа"
                  className="mt-1"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setUploadModalOpen(false)}
                >
                  Отмена
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                >
                  {uploading ? 'Загрузка...' : 'Загрузить'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
