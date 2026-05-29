import { useState, useRef } from 'react'

import { Button } from '@/shared/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { Badge } from '@/shared/components/ui/Badge'
import { useAuthStore } from '@/core/auth/store/authStore'

import { Mail, Phone, Calendar, Briefcase, Building2, Edit2, Save, X, Camera, Loader2, User } from 'lucide-react'

import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { formatDate, getErrorMessage } from '@/shared/lib/utils'

export function Profile() {
  const { user, updateUser } = useAuthStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editedUser, setEditedUser] = useState(user)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Файл слишком большой (максимум 5 МБ)')
      return
    }

    setAvatarError(null)
    setAvatarUploading(true)
    try {
      const formData = new FormData()
      formData.append('avatar', file)
      const res = await fetch(`${API_BASE_URL}/users/me/avatar`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка загрузки')
      }
      const data = await res.json()
      updateUser({ avatar: data.avatar })
    } catch (err: unknown) {
      setAvatarError(getErrorMessage(err))
    } finally {
      setAvatarUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSave = () => {
    if (editedUser) {
      updateUser(editedUser)
      setIsEditing(false)
    }
  }

  const handleCancel = () => {
    setEditedUser(user)
    setIsEditing(false)
  }

  const handleChange = (field: string, value: string) => {
    setEditedUser((prev) => (prev ? { ...prev, [field]: value } : null))
  }

  const getUserInitials = () => {
    if (!user) return '??'
    return `${user.firstName[0]}${user.lastName[0]}`
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      active: { label: 'Активен', className: 'bg-green-100 text-green-800' },
      inactive: { label: 'Неактивен', className: 'bg-muted text-muted-foreground' },
      on_leave: { label: 'В отпуске', className: 'bg-yellow-100 text-yellow-800' },
    }
    return badges[status]
  }

  if (!user) return null

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 bg-primary/10 rounded-xl text-primary">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Профиль</h1>
            <p className="text-sm text-muted-foreground">
              Управление вашей личной информацией
            </p>
          </div>
        </div>
        {!isEditing ? (
          <Button onClick={() => setIsEditing(true)} className="interactive">
            <Edit2 className="mr-2 h-4 w-4" />
            Редактировать
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel} className="interactive">
              <X className="mr-2 h-4 w-4" />
              Отмена
            </Button>
            <Button onClick={handleSave} className="interactive">
              <Save className="mr-2 h-4 w-4" />
              Сохранить
            </Button>
          </div>
        )}
      </div>

      <div className="page-grid grid gap-6 md:grid-cols-3">
        <Card className="section-card md:col-span-1 stagger-1">
          <CardHeader className="text-center">
            <div className="relative mx-auto w-24 h-24">
              <Avatar className="h-24 w-24">
                <AvatarImage
                  src={user.avatar || generateAvatarUrl(user.id, user.gender)}
                  alt={`${user.firstName} ${user.lastName}`}
                />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {getUserInitials()}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="interactive absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                aria-label="Изменить фото"
              >
                {avatarUploading
                  ? <Loader2 className="h-6 w-6 text-white animate-spin" />
                  : <Camera className="h-6 w-6 text-white" />
                }
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            {avatarError && (
              <p className="text-xs text-destructive text-center mt-1">{avatarError}</p>
            )}
            <CardTitle className="mt-4">
              {user.lastName} {user.firstName}
            </CardTitle>
            <CardDescription>{user.position}</CardDescription>
            <Badge className="mx-auto mt-2" variant={user.status === 'active' ? 'success' : 'secondary'}>
              {getStatusBadge(user.status).label}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center justify-center w-7 h-7 bg-primary/10 rounded-lg">
                <Building2 className="h-3.5 w-3.5 text-primary" />
              </div>
              <span>{user.department}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center justify-center w-7 h-7 bg-primary/10 rounded-lg">
                <Calendar className="h-3.5 w-3.5 text-primary" />
              </div>
              <span>Работает с {formatDate(user.hireDate)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="section-card md:col-span-2 stagger-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex items-center justify-center h-6 w-6 bg-primary/10 rounded-lg">
                <Mail className="h-3.5 w-3.5 text-primary" />
              </div>
              Личная информация
            </CardTitle>
            <CardDescription>
              Основная информация о вашем профиле
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lastName">Фамилия</Label>
                {isEditing ? (
                  <Input
                    id="lastName"
                    value={editedUser?.lastName || ''}
                    onChange={(e) => handleChange('lastName', e.target.value)}
                  />
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border p-3">
                    <span className="text-sm">{user.lastName}</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstName">Имя</Label>
                {isEditing ? (
                  <Input
                    id="firstName"
                    value={editedUser?.firstName || ''}
                    onChange={(e) => handleChange('firstName', e.target.value)}
                  />
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border p-3">
                    <span className="text-sm">{user.firstName}</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="middleName">Отчество</Label>
                {isEditing ? (
                  <Input
                    id="middleName"
                    value={editedUser?.middleName || ''}
                    onChange={(e) => handleChange('middleName', e.target.value)}
                  />
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border p-3">
                    <span className="text-sm">{user.middleName || '—'}</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthDate">Дата рождения</Label>
                {isEditing ? (
                  <Input
                    id="birthDate"
                    type="date"
                    value={editedUser?.birthDate || ''}
                    onChange={(e) => handleChange('birthDate', e.target.value)}
                  />
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border p-3">
                    <span className="text-sm">{user.birthDate ? formatDate(user.birthDate) : '—'}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Контактная информация</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="flex items-center gap-2 rounded-lg border p-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.email}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Телефон</Label>
                  {isEditing ? (
                    <Input
                      id="phone"
                      value={editedUser?.phone || ''}
                      onChange={(e) => handleChange('phone', e.target.value)}
                    />
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border p-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{user.phone || '—'}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Информация о работе</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Должность</Label>
                  <div className="flex items-center gap-2 rounded-lg border p-3">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.position}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Отдел</Label>
                  <div className="flex items-center gap-2 rounded-lg border p-3">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.department}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
