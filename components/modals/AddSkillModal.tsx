import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Plus, Search } from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'

const getAuthHeaders = () => {
  const authStorage = localStorage.getItem('auth-storage')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authStorage) {
    try {
      const { state } = JSON.parse(authStorage)
      if (state?.token) headers['Authorization'] = `Bearer ${state.token}`
    } catch (e) {
      console.error('[AddSkillModal] Error parsing auth storage:', e)
    }
  }
  return headers
}

interface AddSkillModalProps {
  open: boolean
  onClose: () => void
  onAdd: (skill: string) => void
  userId: string
}

export function AddSkillModal({ open, onClose, onAdd, userId }: AddSkillModalProps) {
  const [mode, setMode] = useState<'select' | 'create'>('select')
  const [searchQuery, setSearchQuery] = useState('')
  const [newSkill, setNewSkill] = useState('')
  const [allSkills, setAllSkills] = useState<string[]>([])
  const [userSkills, setUserSkills] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setNewSkill('')
      setMode('select')
    }
  }, [open])

  useEffect(() => {
    if (open) {
      fetchSkills()
    }
  }, [open])

  const fetchSkills = async () => {
    try {
      setLoading(true)
      const [allSkillsRes, userRes] = await Promise.all([
        fetch(`${API_BASE_URL}/users/skills/all`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/users/${userId}`, { headers: getAuthHeaders() }),
      ])
      
      if (allSkillsRes.ok) {
        const allSkillsData = await allSkillsRes.json()
        setAllSkills(allSkillsData.map((s: any) => s.name))
      }
      
      if (userRes.ok) {
        const userData = await userRes.json()
        setUserSkills(userData.skills || [])
      }
    } catch (err) {
      console.error('Failed to fetch skills:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredSkills = allSkills
    .filter(skill => !userSkills.includes(skill))
    .filter(skill => skill.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => a.localeCompare(b))

  const handleSelectSkill = (skill: string) => {
    onAdd(skill)
    onClose()
  }

  const handleCreateSkill = (e: React.FormEvent) => {
    e.preventDefault()
    if (newSkill.trim()) {
      onAdd(newSkill.trim())
      setNewSkill('')
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-background rounded-xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <Plus className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Добавить навык</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === 'select' ? 'Выберите навык из списка или создайте новый' : 'Введите название нового навыка'}
          </p>

          {mode === 'select' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="search">Поиск навыков</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Например: JavaScript, Python..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    autoComplete="off"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Доступные навыки</Label>
                {loading ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">Загрузка...</div>
                ) : filteredSkills.length > 0 ? (
                  <div className="max-h-60 overflow-y-auto space-y-1 border rounded-lg p-2">
                    {filteredSkills.map((skill) => (
                      <button
                        key={skill}
                        onClick={() => handleSelectSkill(skill)}
                        className="w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm"
                      >
                        {skill}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    {searchQuery ? 'Ничего не найдено' : 'Все навыки уже добавлены'}
                  </div>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setMode('create')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Добавить новый навык
              </Button>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Отмена
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateSkill} onKeyDown={handleKeyDown}>
              <div className="space-y-4 mb-6">
                <div className="space-y-2">
                  <Label htmlFor="newSkill">Название нового навыка</Label>
                  <Input
                    id="newSkill"
                    placeholder="Например: Управление проектами..."
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    autoFocus
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setMode('select')}>
                  Назад к списку
                </Button>
                <Button type="button" variant="ghost" onClick={onClose}>
                  Отмена
                </Button>
                <Button type="submit" disabled={!newSkill.trim()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Добавить
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
