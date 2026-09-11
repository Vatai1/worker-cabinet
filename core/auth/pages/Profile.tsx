import { useState, useRef } from 'react'
import { toast } from 'sonner'

import { Button } from '@/shared/components/ui/Button'
import { Card } from '@/shared/components/ui/Card'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/Avatar'
import { Badge } from '@/shared/components/ui/Badge'
import { useAuthStore } from '@/core/auth/store/authStore'
import { confirmDialog } from '@/shared/components/ConfirmDialog'

import { Mail, Phone, Calendar, Briefcase, Building2, Edit2, Save, X, Camera, Loader2, User, Sparkles } from 'lucide-react'

import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders } from '@/shared/lib/authHeaders'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { formatDate, getErrorMessage } from '@/shared/lib/utils'

const STATUS_META: Record<string, { label: string; variant: 'success' | 'warning' | 'secondary' }> = {
  active: { label: 'Активен', variant: 'success' },
  on_leave: { label: 'В отпуске', variant: 'warning' },
  inactive: { label: 'Неактивен', variant: 'secondary' },
}

export function Profile() {
  const { user, updateUser } = useAuthStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editedUser, setEditedUser] = useState(user)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Файл слишком большой (максимум 5 МБ)')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

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
      toast.success('Аватар обновлён')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    } finally {
      setAvatarUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleAvatarReset = async () => {
    const confirmed = await confirmDialog({
      title: 'Сбросить аватар?',
      message: 'Фото профиля будет удалено, вместо него будет показана автоматическая аватарка.',
      confirmText: 'Сбросить',
      variant: 'danger',
    })
    if (!confirmed) return

    try {
      const res = await fetch(`${API_BASE_URL}/users/me/avatar`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Не удалось сбросить аватар')
      }
      updateUser({ avatar: undefined })
      toast.success('Аватар сброшен')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    }
  }

  const handleSave = () => {
    if (editedUser) {
      updateUser(editedUser)
      setIsEditing(false)
      toast.success('Профиль обновлён')
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

  if (!user) return null

  const statusMeta = STATUS_META[user.status] ?? STATUS_META.active

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-6 text-white animate-slide-up lg:p-8">
        <div className="absolute top-0 right-0 h-64 w-64 -translate-y-1/3 translate-x-1/3 rounded-full bg-card/5" />
        <div className="absolute bottom-0 left-0 h-48 w-48 -translate-x-1/3 translate-y-1/3 rounded-full bg-card/5" />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-white/60" />
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">Личный кабинет</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card/15 backdrop-blur-sm">
                <User className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight">Профиль</h1>
                <p className="mt-0.5 text-sm text-white/50">Управление вашей личной информацией</p>
              </div>
            </div>
          </div>
          {!isEditing ? (
            <Button
              onClick={() => setIsEditing(true)}
              variant="outline"
              className="border-white/20 bg-card/10 text-white hover:bg-card/20 hover:text-white"
            >
              <Edit2 className="mr-2 h-4 w-4" />
              Редактировать
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleCancel}
                className="border-white/20 bg-card/10 text-white hover:bg-card/20 hover:text-white"
              >
                <X className="mr-2 h-4 w-4" />
                Отмена
              </Button>
              <Button onClick={handleSave} variant="outline" className="border-transparent bg-white text-primary hover:bg-white/90">
                <Save className="mr-2 h-4 w-4" />
                Сохранить
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="overflow-hidden p-0 md:col-span-1">
          <div className="flex flex-col items-center px-6 py-7 text-center">
            <div className="group relative">
              <Avatar className="h-24 w-24 ring-4 ring-primary/10">
                <AvatarImage
                  src={user.avatar || generateAvatarUrl(user.id, user.gender)}
                  alt={`${user.firstName} ${user.lastName}`}
                />
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-2xl font-bold text-primary">
                  {getUserInitials()}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-black/50 text-white opacity-0 transition-opacity duration-200 cursor-pointer group-hover:opacity-100 disabled:cursor-wait"
                aria-label="Изменить фото"
              >
                {avatarUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Camera className="h-5 w-5" />
                    <span className="text-[11px] font-medium">Фото</span>
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            {user.avatar && (
              <button
                type="button"
                onClick={handleAvatarReset}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="h-3 w-3" />
                Сбросить фото
              </button>
            )}

            <h2 className="mt-4 text-lg font-bold leading-tight">
              {user.lastName} {user.firstName}
            </h2>
            <p className="text-sm text-muted-foreground">{user.position}</p>
            <Badge variant={statusMeta.variant} className="mt-2">
              {statusMeta.label}
            </Badge>
          </div>
          <div className="space-y-3 border-t border-border px-6 py-5">
            <div className="flex items-center gap-3 text-sm">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="h-3.5 w-3.5" />
              </div>
              <span className="truncate">{user.department}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Calendar className="h-3.5 w-3.5" />
              </div>
              <span>Работает с {formatDate(user.hireDate)}</span>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden p-0 md:col-span-2">
          <div className="flex items-center gap-2.5 border-b border-border px-6 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">Личная информация</h2>
              <p className="text-xs text-muted-foreground">Основная информация о вашем профиле</p>
            </div>
          </div>
          <div className="space-y-6 p-6">
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
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
                    {user.lastName}
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
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
                    {user.firstName}
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
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
                    {user.middleName || '—'}
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
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
                    {user.birthDate ? formatDate(user.birthDate) : '—'}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Контактная информация</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
                    <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{user.email}</span>
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
                    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
                      <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{user.phone || '—'}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Информация о работе</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Должность</Label>
                  <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
                    <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{user.position}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Отдел</Label>
                  <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{user.department}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
