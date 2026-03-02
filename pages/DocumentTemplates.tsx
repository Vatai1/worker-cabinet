import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import { FileText, Download, Search, FilePlus } from 'lucide-react'
import { Input } from '@/components/ui/Input'

interface DocumentTemplate {
  id: string
  name: string
  description: string
  category: 'hr' | 'legal' | 'finance' | 'general'
  createdAt: string
  downloads: number
}

const MOCK_TEMPLATES: DocumentTemplate[] = [
  { id: '1', name: 'Заявление на отпуск', description: 'Шаблон заявления на ежегодный оплачиваемый отпуск', category: 'hr', createdAt: '2025-01-15', downloads: 145 },
  { id: '2', name: 'Трудовой договор', description: 'Стандартный шаблон трудового договора', category: 'legal', createdAt: '2025-01-10', downloads: 89 },
  { id: '3', name: 'Заявление на увольнение', description: 'Шаблон заявления об увольнении по собственному желанию', category: 'hr', createdAt: '2025-01-08', downloads: 67 },
  { id: '4', name: 'Авансовый отчёт', description: 'Форма авансового отчёта для командировочных расходов', category: 'finance', createdAt: '2025-01-05', downloads: 123 },
  { id: '5', name: 'NDA', description: 'Соглашение о неразглашении конфиденциальной информации', category: 'legal', createdAt: '2024-12-20', downloads: 234 },
  { id: '6', name: 'Служебная записка', description: 'Общий шаблон служебной записки', category: 'general', createdAt: '2024-12-15', downloads: 312 },
  { id: '7', name: 'Заявление на командировку', description: 'Шаблон заявления на направление в командировку', category: 'hr', createdAt: '2024-12-10', downloads: 78 },
  { id: '8', name: 'Договор подряда', description: 'Шаблон договора подряда с физическим лицом', category: 'legal', createdAt: '2024-12-05', downloads: 56 },
]

const CATEGORY_LABELS = {
  hr: { label: 'Кадры', className: 'bg-blue-100 text-blue-800' },
  legal: { label: 'Правовые', className: 'bg-purple-100 text-purple-800' },
  finance: { label: 'Финансы', className: 'bg-green-100 text-green-800' },
  general: { label: 'Общие', className: 'bg-gray-100 text-gray-800' },
}

type CategoryType = 'all' | 'hr' | 'legal' | 'finance' | 'general'

export function DocumentTemplates() {
  const [filterCategory, setFilterCategory] = useState<CategoryType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setTimeout(() => {
      setTemplates(MOCK_TEMPLATES)
      setLoading(false)
    }, 500)
  }, [])

  const filteredTemplates = templates.filter((template) => {
    const matchesCategory = filterCategory === 'all' || template.category === filterCategory
    const matchesSearch = searchQuery === '' ||
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const handleDownload = (template: DocumentTemplate) => {
    setTemplates(prev => prev.map(t => 
      t.id === template.id ? { ...t, downloads: t.downloads + 1 } : t
    ))
    alert(`Загрузка шаблона "${template.name}" начнётся автоматически`)
  }

  const handleUseTemplate = (template: DocumentTemplate) => {
    alert(`Создание документа на основе шаблона "${template.name}"`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Шаблоны документов</h1>
          <p className="text-muted-foreground">
            Готовые формы и шаблоны для оформления документов
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Поиск шаблонов..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={filterCategory === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterCategory('all')}
              >
                Все
              </Button>
              <Button
                variant={filterCategory === 'hr' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterCategory('hr')}
              >
                Кадры
              </Button>
              <Button
                variant={filterCategory === 'legal' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterCategory('legal')}
              >
                Правовые
              </Button>
              <Button
                variant={filterCategory === 'finance' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterCategory('finance')}
              >
                Финансы
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
              <p className="mt-4 text-lg font-medium">Загрузка шаблонов...</p>
            </div>
          </CardContent>
        </Card>
      ) : filteredTemplates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-20" />
              <p className="mt-4 text-lg font-medium">Шаблоны не найдены</p>
              <p className="text-sm text-muted-foreground">
                {searchQuery || filterCategory !== 'all'
                  ? 'Попробуйте изменить параметры поиска'
                  : 'Шаблоны пока не добавлены'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => {
            const categoryInfo = CATEGORY_LABELS[template.category]
            
            return (
              <Card key={template.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base line-clamp-1">
                        {template.name}
                      </CardTitle>
                      <CardDescription className="line-clamp-2 mt-1">
                        {template.description}
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
                      <Badge className={categoryInfo.className} variant="secondary">
                        {categoryInfo.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {template.downloads} загрузок
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Добавлен: {formatDate(template.createdAt)}
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        className="flex-1" 
                        variant="default" 
                        size="sm" 
                        onClick={() => handleUseTemplate(template)}
                      >
                        <FilePlus className="mr-2 h-4 w-4" />
                        Использовать
                      </Button>
                      <Button 
                        className="flex-1" 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleDownload(template)}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Скачать
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Всего шаблонов</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{templates.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Категории</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">4</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Всего загрузок</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {templates.reduce((acc, t) => acc + t.downloads, 0)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
