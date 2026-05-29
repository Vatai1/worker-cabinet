import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/core/auth/store/authStore'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError('Неверный email или пароль')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen relative overflow-hidden">
      <div className="hidden lg:flex lg:w-[45%] gradient-primary items-center justify-center p-12 relative">
        <div className="absolute inset-0 login-grid-bg opacity-30" />
        <div className="absolute top-[20%] left-[10%] w-32 h-32 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute bottom-[25%] right-[15%] w-40 h-40 bg-white/10 rounded-full blur-2xl" />
        <div className="relative z-10 text-white max-w-md">
          <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center mb-6 ring-1 ring-white/20">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold mb-3 leading-tight">Личный кабинет сотрудника</h1>
          <p className="text-white/70 text-lg leading-relaxed">Единая платформа для управления персоналом, отпусками и документами</p>
          <div className="grid grid-cols-3 gap-4 mt-10">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 ring-1 ring-white/10">
              <p className="text-3xl font-extrabold">24</p>
              <p className="text-white/60 text-xs mt-1">дня отпуска</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 ring-1 ring-white/10">
              <p className="text-3xl font-extrabold">156</p>
              <p className="text-white/60 text-xs mt-1">сотрудников</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 ring-1 ring-white/10">
              <p className="text-3xl font-extrabold">12</p>
              <p className="text-white/60 text-xs mt-1">отделов</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12 gradient-bg relative">
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />

      <Card className="w-full max-w-md animate-fade-in relative backdrop-blur-sm">
        <div className="lg:hidden text-center mb-6 pt-6">
          <div className="mx-auto w-14 h-14 gradient-primary rounded-2xl shadow-glow flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <p className="text-2xl font-bold text-gradient">Личный кабинет</p>
        </div>
        <CardHeader className="space-y-2 text-center pb-6">
          <CardTitle className="text-2xl font-bold">Вход в систему</CardTitle>
          <CardDescription className="text-base">
            Введите свои учетные данные
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="ivanov@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={6}
              />
            </div>
            {error && (
              <div className="rounded-xl bg-destructive/15 border border-destructive/20 p-4 text-sm text-destructive animate-in">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Вход...
                </>
              ) : (
                'Войти'
              )}
            </Button>
          </form>
          <div className="mt-8 space-y-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Демо-доступ</span>
              </div>
            </div>
            <div className="grid gap-3">
              <button type="button" onClick={() => { setEmail('ivanov@example.com'); setPassword('password123') }} className="rounded-xl border border-primary/20 bg-primary/5 p-4 hover:bg-primary/10 transition-colors text-left w-full">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Сотрудник</p>
                    <p className="font-mono text-xs text-muted-foreground mt-0.5">ivanov@example.com</p>
                  </div>
                </div>
              </button>
              <button type="button" onClick={() => { setEmail('admin@example.com'); setPassword('password123') }} className="rounded-xl border border-primary/20 bg-primary/5 p-4 hover:bg-primary/10 transition-colors text-left w-full">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Администратор</p>
                    <p className="font-mono text-xs text-muted-foreground mt-0.5">admin@example.com</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
