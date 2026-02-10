import { useState } from 'react'
import { formatFileSize } from '@/data/mockData'
import type { Document } from '@/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import { FileText, Download, Search, Upload } from 'lucide-react'
import { Input } from '@/components/ui/Input'

type DocumentType = 'all' | 'contract' | 'nda' | 'policy' | 'certificate' | 'other'

export function Documents() {
  const [filterType, setFilterType] = useState<DocumentType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [documents] = useState<Document[]>([])

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
      {filteredDocuments.length === 0 ? (
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
                    <div className="flex items-center justify-between">
                      <Badge className={typeBadge.className} variant="secondary">
                        {typeBadge.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(doc.uploadDate)}
                      </span>
                    </div>
                    <Button className="w-full" variant="outline" size="sm">
                      <Download className="mr-2 h-4 w-4" />
                      Скачать
                    </Button>
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
    </div>
  )
}
