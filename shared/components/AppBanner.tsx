import { useEffect, useState } from 'react'
import { Info, AlertTriangle, AlertOctagon } from 'lucide-react'
import { apiGet } from '@/shared/lib/apiClient'
import { useOrgStore } from '@/shared/store/orgStore'
import { cn } from '@/shared/lib/utils'

interface BannerData {
  level: string
  text: string
}

interface BannersResponse {
  global: BannerData | null
  org: BannerData | null
}

const LEVEL_STYLES: Record<string, string> = {
  info: 'bg-primary/10 text-primary border-b border-primary/20',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-b border-amber-500/25',
  danger: 'bg-red-500/15 text-red-700 dark:text-red-400 border-b border-red-500/25',
}

const LEVEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  info: Info,
  warning: AlertTriangle,
  danger: AlertOctagon,
}

function BannerStrip({ level, text }: BannerData) {
  const Icon = LEVEL_ICONS[level] || Info
  return (
    <div className={cn('flex items-center justify-center gap-2 px-4 py-2 text-center text-sm font-medium', LEVEL_STYLES[level])}>
      <Icon className="h-4 w-4 shrink-0" />
      <span>{text}</span>
    </div>
  )
}

export function AppBanner() {
  const [banners, setBanners] = useState<BannersResponse>({ global: null, org: null })
  const currentOrgId = useOrgStore((s) => s.currentOrgId)

  useEffect(() => {
    apiGet<BannersResponse>('/banner')
      .then(setBanners)
      .catch(() => {})
  }, [currentOrgId])

  if (!banners.global && !banners.org) return null

  return (
    <>
      {banners.global && <BannerStrip level={banners.global.level} text={banners.global.text} />}
      {banners.org && <BannerStrip level={banners.org.level} text={banners.org.text} />}
    </>
  )
}
