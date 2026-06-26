import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '@/core/auth/store/authStore'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Label } from '@/shared/components/ui/Label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { useSiteSettingsStore } from '@/shared/store/siteSettingsStore'
import { API_BASE_URL } from '@/shared/lib/api'

interface AuthConfig {
  keycloak: boolean
  authUrl?: string
  tokenUrl?: string
  logoutUrl?: string
  clientId?: string
}

function generateCodeVerifier(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    .padEnd(43, 'a')
}

async function sha256(message: string): Promise<ArrayBuffer> {
  const msgBuffer = new TextEncoder().encode(message)
  return crypto.subtle.digest('SHA-256', msgBuffer)
}

function base64urlencode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hashed = await sha256(verifier)
  return base64urlencode(hashed)
}

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [kcHandled, setKcHandled] = useState(false)
  const [kcLoading, setKcLoading] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const login = useAuthStore((state) => state.login)
  const { settings, loaded, fetchPublicSettings } = useSiteSettingsStore()

  useEffect(() => {
    if (!loaded) fetchPublicSettings()
  }, [loaded, fetchPublicSettings])

  useEffect(() => {
    fetch(`${API_BASE_URL}/auth/config`)
      .then(res => res.json())
      .then(config => setAuthConfig(config))
      .catch(() => setAuthConfig({ keycloak: false }))
      .finally(() => setLoadingConfig(false))
  }, [])

  const code = searchParams.get('code')
  const kcError = searchParams.get('error')

  useEffect(() => {
    if (kcError) {
      const messages: Record<string, string> = {
        access_denied: 'Доступ запрещён',
        invalid_scope: 'Неверная область доступа',
        server_error: 'Ошибка сервера Keycloak',
        temporarily_unavailable: 'Сервер авторизации временно недоступен',
      }
      setError(messages[kcError] || `Ошибка авторизации: ${kcError}`)
    }
  }, [kcError])

  useEffect(() => {
    if (!code || !authConfig?.tokenUrl || kcHandled) return
    const verifier = sessionStorage.getItem('pkce_verifier')
    if (!verifier) {
      setError('Ошибка PKCE — повторите попытку')
      return
    }

    setKcLoading(true)
    const redirectUri = `${window.location.origin}/login`

    fetch(`${API_BASE_URL}/auth/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: redirectUri }),
    })
      .then(res => {
        if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Ошибка авторизации') })
        return res.json()
      })
      .then(() => {
        sessionStorage.removeItem('pkce_verifier')
        setKcHandled(true)
        window.location.href = '/dashboard'
      })
      .catch(err => {
        setKcHandled(true)
        setError(err.message)
      })
      .finally(() => setKcLoading(false))
  }, [code, authConfig, navigate])

  const handleKeycloakLogin = async () => {
    if (!authConfig?.authUrl) return
    setIsLoading(true)
    try {
      const verifier = generateCodeVerifier()
      const challenge = await generateCodeChallenge(verifier)
      sessionStorage.setItem('pkce_verifier', verifier)

      const redirectUri = `${window.location.origin}/login`
      const authUrl = `${authConfig.authUrl}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`

      window.location.href = authUrl
    } catch {
      setError('Ошибка инициализации авторизации')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch {
      setError('Неверный email или пароль')
    } finally {
      setIsLoading(false)
    }
  }

  const isDev = import.meta.env.DEV

  const handleDemoLogin = async (demoEmail: string) => {
    setError('')
    setIsLoading(true)
    try {
      await login(demoEmail, 'password123')
      navigate('/dashboard')
    } catch {
      setError('Неверный email или пароль')
    } finally {
      setIsLoading(false)
    }
  }

  const showDemo = isDev && (loaded ? settings.login_demo_buttons !== 'false' : true)
  const title = settings.login_title || 'Личный кабинет сотрудника'
  const subtitle = settings.login_subtitle || 'Единая платформа для управления персоналом, отпусками и документами'

  if (loadingConfig) {
    return (
      <div className="flex min-h-screen gradient-bg items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (kcLoading) {
    return (
      <div className="flex min-h-screen gradient-bg items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Авторизация через Keycloak...</p>
        </div>
      </div>
    )
  }

  if (authConfig?.keycloak) {
    return (
      <div className="flex min-h-screen relative overflow-hidden">
        <div className="hidden lg:flex lg:w-[45%] gradient-primary items-center justify-center p-12 relative">
          <div className="absolute inset-0 login-grid-bg opacity-30"></div>
          <div className="absolute top-[20%] left-[10%] w-32 h-32 bg-card/10 rounded-full blur-2xl"></div>
          <div className="absolute bottom-[25%] right-[15%] w-40 h-40 bg-card/10 rounded-full blur-2xl"></div>
          <div className="relative z-10 text-white max-w-md">
            <div className="w-14 h-14 rounded-2xl bg-card/15 backdrop-blur-sm flex items-center justify-center mb-6 ring-1 ring-white/20">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h1 className="text-4xl font-extrabold mb-3 leading-tight">{title}</h1>
            <p className="text-white/70 text-lg leading-relaxed">{subtitle}</p>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-4 py-12 gradient-bg relative overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>

          <Card className="w-full max-w-md animate-fade-in relative backdrop-blur-sm">
            <CardHeader className="space-y-2 text-center pb-8">
              <div className="mx-auto w-16 h-16 gradient-primary rounded-2xl shadow-glow flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">Личный кабинет</CardTitle>
                <CardDescription className="text-base">
                  Войдите через корпоративную учётную запись
                </CardDescription>
              </CardHeader>
              <CardContent>
                {error && (
                  <div className="rounded-xl bg-destructive/15 border border-destructive/20 p-4 text-sm text-destructive animate-in mb-6">
                    {error}
                  </div>
                )}
                <Button className="w-full" size="lg" onClick={handleKeycloakLogin}>
                  Войти через Keycloak
                </Button>
              </CardContent>
              </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen relative overflow-hidden">
      <div className="hidden lg:flex lg:w-[45%] gradient-primary items-center justify-center p-12 relative">
        <div className="absolute inset-0 login-grid-bg opacity-30"></div>
        <div className="absolute top-[20%] left-[10%] w-32 h-32 bg-card/10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-[25%] right-[15%] w-40 h-40 bg-card/10 rounded-full blur-2xl"></div>
        <div className="relative z-10 text-white max-w-md">
          <div className="w-14 h-14 rounded-2xl bg-card/15 backdrop-blur-sm flex items-center justify-center mb-6 ring-1 ring-white/20">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold mb-3 leading-tight">{title}</h1>
          <p className="text-white/70 text-lg leading-relaxed">{subtitle}</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12 gradient-bg relative overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>

        <Card className="w-full max-w-md animate-fade-in relative backdrop-blur-sm">
          <CardHeader className="space-y-2 text-center pb-8">
            <div className="mx-auto w-16 h-16 gradient-primary rounded-2xl shadow-glow flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">Личный кабинет</CardTitle>
            <CardDescription className="text-base">
              Введите свои учетные данные для входа
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
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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
            {showDemo && (
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
                  <button type="button" onClick={() => handleDemoLogin('ivanov@example.com')} disabled={isLoading} className="rounded-xl border border-primary/20 bg-primary/5 p-4 hover:bg-primary/10 transition-colors text-left w-full disabled:opacity-50">
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
                  <button type="button" onClick={() => handleDemoLogin('petrov@example.com')} disabled={isLoading} className="rounded-xl border border-primary/20 bg-primary/5 p-4 hover:bg-primary/10 transition-colors text-left w-full disabled:opacity-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                        <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 005.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Начальник отдела</p>
                        <p className="font-mono text-xs text-muted-foreground mt-0.5">petrov@example.com</p>
                      </div>
                    </div>
                  </button>
                  <button type="button" onClick={() => handleDemoLogin('elena@example.com')} disabled={isLoading} className="rounded-xl border border-primary/20 bg-primary/5 p-4 hover:bg-primary/10 transition-colors text-left w-full disabled:opacity-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                        <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">HR</p>
                        <p className="font-mono text-xs text-muted-foreground mt-0.5">elena@example.com</p>
                      </div>
                    </div>
                  </button>
                  <button type="button" onClick={() => handleDemoLogin('admin@example.com')} disabled={isLoading} className="rounded-xl border border-primary/20 bg-primary/5 p-4 hover:bg-primary/10 transition-colors text-left w-full disabled:opacity-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                        <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
