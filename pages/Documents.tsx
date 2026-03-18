import { useState, useEffect, useRef } from 'react'
import { formatFileSize } from '@/data/mockData'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import { FileText, Download, Search, Upload, Eye, X, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

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
    } catch (err: any) {
      console.error('Error fetching documents:', err)
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
      other: { label: 'Другое', className: 'bg-gray-100 text-gray-800' },
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
      alert('Не удалось скачать файл')
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
      alert('Не удалось открыть файл для просмотра')
    }
  }

  const handleDelete = async (doc: UserDocument) => {
    if (!confirm(`Удалить документ "${doc.name}"?`)) return
    
    try {
      const res = await fetch(`${API_BASE_URL}/user-documents/${doc.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error('Ошибка удаления')
      
      setDocuments(prev => prev.filter(d => d.id !== doc.id))
    } catch (error) {
      alert('Не удалось удалить документ')
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
    } catch (error: any) {
      alert(error.message || 'Не удалось загрузить документ')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ваши документы</h1>
          <p className="text-muted-foreground">
            Личные документы: договоры, сертификаты и другие файлы
          </p>
        </div>
        {user?.role === 'manager' && (
          <Button onClick={() => setUploadModalOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Загрузить документ
          </Button>
        )}
      </div>

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
                  : 'У вас пока нет загруженных документов'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredDocuments.map((doc) => {
            const categoryBadge = getCategoryBadge(doc.category)
            
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
              {documents.filter((d) => d.category === 'contract').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Сертификаты</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documents.filter((d) => d.category === 'certificate').length}
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

      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
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
