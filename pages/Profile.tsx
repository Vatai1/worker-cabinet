import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Avatar, AvatarFallback } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import { Mail, Phone, Calendar, MapPin, Briefcase, Building2, Edit2, Save, X } from 'lucide-react'

export function Profile() {
  const { user, updateUser } = useAuthStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editedUser, setEditedUser] = useState(user)

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

  const handleChange = (field: keyof typeof editedUser, value: string) => {
    setEditedUser((prev) => (prev ? { ...prev, [field]: value } : null))
  }

  const getUserInitials = () => {
    if (!user) return '??'
    return `${user.firstName[0]}${user.lastName[0]}`
  }

  const getStatusBadge = (status: typeof user.status) => {
    const badges = {
      active: { label: 'Активен', className: 'bg-green-100 text-green-800' },
      inactive: { label: 'Неактивен', className: 'bg-gray-100 text-gray-800' },
      on_leave: { label: 'В отпуске', className: 'bg-yellow-100 text-yellow-800' },
    }
    return badges[status]
  }

  if (!user) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Профиль</h1>
          <p className="text-muted-foreground">
            Управление вашей личной информацией
          </p>
        </div>
        {!isEditing ? (
          <Button onClick={() => setIsEditing(true)}>
            <Edit2 className="mr-2 h-4 w-4" />
            Редактировать
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel}>
              <X className="mr-2 h-4 w-4" />
              Отмена
            </Button>
            <Button onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              Сохранить
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Profile card */}
        <Card className="md:col-span-1">
          <CardHeader className="text-center">
            <Avatar className="mx-auto h-24 w-24">
              <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                {getUserInitials()}
              </AvatarFallback>
            </Avatar>
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
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span>{user.department}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Работает с {formatDate(user.hireDate)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Personal info */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Личная информация</CardTitle>
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
                  <div className="flex items-center gap-2 rounded-md border p-3">
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
                  <div className="flex items-center gap-2 rounded-md border p-3">
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
                  <div className="flex items-center gap-2 rounded-md border p-3">
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
                  <div className="flex items-center gap-2 rounded-md border p-3">
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
                  <div className="flex items-center gap-2 rounded-md border p-3">
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
                    <div className="flex items-center gap-2 rounded-md border p-3">
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
                  <div className="flex items-center gap-2 rounded-md border p-3">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.position}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Отдел</Label>
                  <div className="flex items-center gap-2 rounded-md border p-3">
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
