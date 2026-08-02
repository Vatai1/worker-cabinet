import { useThemeStore } from '@/shared/theme/themeStore'
import { useUIStore } from '@/shared/store/uiStore'
import { themes } from '@/shared/theme/themes'
import { cn } from '@/shared/lib/utils'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
  variant?: 'auto' | 'light' | 'dark'
  className?: string
}

const sizeConfig = {
  sm: { img: 'h-7', text: 'text-sm' },
  md: { img: 'h-9', text: 'text-base' },
  lg: { img: 'h-14', text: 'text-lg' },
}

export function Logo({ size = 'md', showText = true, variant = 'auto', className }: Props) {
  const activeTheme = useThemeStore((s) => s.activeTheme)
  const darkMode = useUIStore((s) => s.darkMode)
  const theme = themes[activeTheme]
  const cfg = sizeConfig[size]

  const logo = theme?.logo
  let src: string | undefined
  if (logo) {
    if (variant === 'dark') src = logo.dark
    else if (variant === 'light') src = logo.light
    else src = darkMode ? (logo.dark || logo.light) : (logo.light || logo.dark)
  }

  if (!src && !showText) return null

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {src && <img src={src} alt="Логотип" className={cn(cfg.img, 'w-auto shrink-0')} />}
      {showText && (
        <span className={cn('font-bold tracking-tight leading-tight', cfg.text)}>Worker Cabinet</span>
      )}
    </div>
  )
}
