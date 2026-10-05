import { useEffect, useRef, useState } from 'react'
import { LoginHero } from '@/core/auth/components/LoginHero'

const SCREEN_WIDTH = 1280
const SCREEN_HEIGHT = 720

function FakeField({ label }: { label: string }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="h-11 rounded-xl border border-input bg-background" />
    </div>
  )
}

export function LoginPreview({ title, subtitle, demoButtons, keycloak }: { title: string; subtitle: string; demoButtons: boolean; keycloak: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)

  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const update = () => setScale(el.clientWidth / SCREEN_WIDTH)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={frameRef}
      data-testid="login-preview"
      aria-label="Предпросмотр страницы входа"
      className="relative w-full overflow-hidden rounded-xl border border-border shadow-sm"
      style={{ height: SCREEN_HEIGHT * scale }}
    >
      <div
        className="pointer-events-none absolute left-0 top-0 flex select-none"
        style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        aria-hidden
      >
        <LoginHero title={title} subtitle={subtitle} className="flex w-[45%]" />
        <div className="relative flex flex-1 items-center justify-center gradient-bg px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg">
            <div className="mb-8 space-y-2 text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-2xl gradient-primary" />
              <div className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-3xl font-bold text-transparent">Личный кабинет</div>
              <div className="text-base text-muted-foreground">{keycloak ? 'Войдите через корпоративную учётную запись' : 'Введите свои учетные данные для входа'}</div>
            </div>
            {keycloak ? (
              <div className="flex h-12 items-center justify-center rounded-xl gradient-primary text-base font-medium text-white">Войти через Keycloak</div>
            ) : (
            <div className="space-y-5">
              <FakeField label="Email" />
              <FakeField label="Пароль" />
              <div className="flex h-11 items-center justify-center rounded-xl gradient-primary text-sm font-medium text-white">Войти</div>
              {demoButtons && (
                <div className="space-y-2 pt-2">
                  <div className="text-center text-xs text-muted-foreground">Быстрый вход (только в режиме разработки)</div>
                  <div className="grid grid-cols-3 gap-2">
                    {['Админ', 'HR', 'Работник'].map((r) => (
                      <div key={r} className="rounded-lg border border-border py-2 text-center text-xs">{r}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
