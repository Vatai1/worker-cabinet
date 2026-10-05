import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/Card'
import { AppearanceSettings } from '@/core/admin/components/modules/AppearanceSettings'
import { Palette } from 'lucide-react'

export function AppearanceTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" /> Темы</CardTitle>
        <CardDescription>Выбор темы оформления системы</CardDescription>
      </CardHeader>
      <CardContent>
        <AppearanceSettings />
      </CardContent>
    </Card>
  )
}
