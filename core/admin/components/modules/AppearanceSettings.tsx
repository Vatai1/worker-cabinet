import { useState, useEffect } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useModuleSettingsStore } from '@/core/admin/store/moduleSettingsStore'
import { useThemeStore } from '@/shared/theme/themeStore'
import { themes } from '@/shared/theme/themes'
import type { AppearanceSettings } from './types'

export function AppearanceSettings() {
  const settings = useModuleSettingsStore((s) => s.getSettings<AppearanceSettings>('appearance'))
  const updateSetting = useModuleSettingsStore((s) => s.updateSetting)
  const saveSettings = useModuleSettingsStore((s) => s.saveSettings)
  const resetToDefaults = useModuleSettingsStore((s) => s.resetToDefaults)
  const isDirty = useModuleSettingsStore((s) => s.isDirty('appearance'))
  const saving = useModuleSettingsStore((s) => s.saving['appearance'])

  const applyTheme = useThemeStore((s) => s.applyTheme)

  const [previewTheme, setPreviewTheme] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setPreviewTheme(settings.activeTheme)
  }, [settings.activeTheme])

  const handleSelect = (id: string) => {
    setPreviewTheme(id)
    applyTheme(id)
    updateSetting('appearance', 'activeTheme', id)
  }

  const handleSave = async () => {
    const ok = await saveSettings('appearance')
    if (ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const handleReset = () => {
    resetToDefaults('appearance')
    const def = themes['crct']
    if (def) applyTheme('crct')
    setPreviewTheme('crct')
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {Object.values(themes).map((theme) => {
          const isSelected = previewTheme === theme.id
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => handleSelect(theme.id)}
              className={cn(
                'group relative rounded-xl border-2 p-5 text-left transition-all duration-200',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                  : 'border-border hover:border-primary/30 hover:shadow-sm'
              )}
            >
              {isSelected && (
                <div className="absolute top-3 right-3 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground">
                  <Check className="w-3.5 h-3.5" />
                </div>
              )}
              <div className="flex items-center gap-3 mb-3">
                {theme.logo?.light && (
                  <div className="w-10 h-10 rounded-lg bg-white shadow-inner flex items-center justify-center p-1.5">
                    <img src={theme.logo.light} alt="" className="h-full w-auto" />
                  </div>
                )}
                <div
                  className="w-10 h-10 rounded-lg shadow-inner"
                  style={{ background: `hsl(${theme.light['--primary']})` }}
                />
                <div
                  className="w-7 h-7 rounded-full shadow-inner"
                  style={{ background: `hsl(${theme.light['--accent']})` }}
                />
                <div className="flex-1 h-7 rounded-lg border border-border" style={{ background: `hsl(${theme.light['--background']})` }}>
                  <div className="h-full w-1/2 rounded-lg" style={{ background: `hsl(${theme.light['--card']})`, marginLeft: 4, marginTop: 2, marginBottom: 2, width: 'calc(50% - 8px)' }} />
                </div>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-foreground">{theme.name}</span>
              </div>
              <p className="text-xs text-muted-foreground">{theme.description}</p>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-primary-foreground transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 active:bg-primary/80 bg-primary"
        >
          {saved ? 'Сохранено ✓' : saving ? 'Сохранение...' : 'Сохранить'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground hover:bg-secondary"
        >
          <RotateCcw className="w-4 h-4" />
          Сбросить по умолчанию
        </button>
      </div>
    </div>
  )
}
