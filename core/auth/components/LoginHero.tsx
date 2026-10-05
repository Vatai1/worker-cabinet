import { Logo } from '@/shared/components/brand/Logo'
import { cn } from '@/shared/lib/utils'

export const DEFAULT_LOGIN_TITLE = 'Личный кабинет работника'
export const DEFAULT_LOGIN_SUBTITLE = 'Единая платформа для управления персоналом, отпусками и документами'

export function LoginHero({ title, subtitle, className }: { title: string; subtitle: string; className?: string }) {
  return (
    <div className={cn('gradient-primary items-center justify-center p-12 relative', className)}>
      <div className="absolute inset-0 login-grid-bg opacity-30"></div>
      <div className="absolute top-[20%] left-[10%] w-32 h-32 bg-card/10 rounded-full blur-2xl"></div>
      <div className="absolute bottom-[25%] right-[15%] w-40 h-40 bg-card/10 rounded-full blur-2xl"></div>
      <div className="relative z-10 text-white max-w-md">
        <Logo size="lg" showText={false} variant="dark" className="mb-6" />
        <h1 className="text-4xl font-extrabold mb-3 leading-tight break-words">{title || DEFAULT_LOGIN_TITLE}</h1>
        <p className="text-white/70 text-lg leading-relaxed break-words">{subtitle || DEFAULT_LOGIN_SUBTITLE}</p>
      </div>
    </div>
  )
}
