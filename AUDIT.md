# Аудит Worker Cabinet

Полный анализ кодовой базы. Дата: 24.06.2026.

---

## 1. Лишние файлы и директории

### 1.1 Скриншоты в корне (HIGH)

12 файлов `dark-*.png` (~2.3 МБ) в корне репозитория — скриншоты страниц.
Не принадлежат к исходному коду, раздувают git-history.

**Рекомендация**: удалить или перенести в `docs/screenshots/`, добавить `*.png` в `.gitignore`.

### 1.2 `.playwright-mcp/` (HIGH)

4 файла (логи и дампы страниц Playwright MCP) в репозитории.
Генерируемые артефакты отладки.

**Рекомендация**: добавить `.playwright-mcp/` в `.gitignore`, `git rm --cached .playwright-mcp/`.

### 1.3 `docker/hermes/data/skills/` — 505 файлов (MEDIUM)

Скиллы Hermes Agent, загруженные из внешнего источника. Не являются частью проекта Worker Cabinet.
Раздувают репозиторий.

**Рекомендация**: добавить `docker/hermes/data/skills/` в `.gitignore`, provisions at deploy time.

### 1.4 `hermes-webui/` — пустая директория (LOW)

Пустая, ни на что не ссылается.

**Рекомендация**: удалить.

### 1.5 `playwright-report/`, `test-results/`, `tests/` (LOW)

Генерируемые артефакты Playwright e2e. Уже в `.gitignore`, но директории отслеживаются как пустые.

**Рекомендация**: `git clean -fd` или добавить в `.gitignore` через `!.gitkeep` трюк.

---

## 2. Неиспользуемый код

### 2.1 `shared/store/departmentsStore.ts` — полностью неиспользуем (HIGH)

Store экспортирует `useDepartmentsStore`, но **ни один файл в проекте его не импортирует**.
Departments загружаются локально в компонентах, а не через этот store.

**Рекомендация**: удалить `shared/store/departmentsStore.ts`.

### 2.2 `shared/components/Skeleton.tsx` — полностью неиспользуем (MEDIUM)

Экспортирует `Skeleton`, `CardSkeleton`, `TableSkeleton`, `ListSkeleton`.
**Ни один файл проекта их не импортирует**.

**Рекомендация**: удалить или начать использовать для loading states.

### 2.3 `shared/components/ui/ContextMenu.tsx` — полностью неиспользуем (MEDIUM)

Кастомный `ContextMenu` не импортируется нигде.

**Рекомендация**: удалить.

### 2.4 `shared/data/mockData.ts` — файл-мисконцепция (MEDIUM)

Название `mockData.ts`, но содержит **реальные утилиты** (`getRequestTypeLabel`, `getRequestStatusBadge`, `formatFileSize`).
- `formatFileSize` дублируется в `shared/lib/documentUtils.ts:96` (два разных имплемента!)
  - `mockData.ts` версия: `Math.round(bytes / Math.pow(k, i) * 100) / 100`
  - `documentUtils.ts` версия: `size.toFixed(1)` — **разное поведение при округлении**
- `Documents.tsx` импортирует `formatFileSize` из `mockData.ts`, а `OnlyOfficePreviewModal.tsx` — из `documentUtils.ts`

**Рекомендация**: удалить `formatFileSize` из `mockData.ts`, переименовать файл в `shared/lib/requestUtils.ts`.

### 2.5 `shared/lib/coonstants.ts` — только `getAvatarColr` (LOW)

Файл содержит только градиенты для аватаров. Имя файла слишком общее.

**Рекомендация**: переименовать в `shared/lib/avatarColors.ts` или переместить в `shared/lib/avatar.ts`.

### 2.6 `backend/src/middleware/validation.js` — `validateLogin` и `validateRegister` не используются (MEDIUM)

`sanitizeInput` используется в `auth.js` через `router.use(sanitizeInput)`.
Но `validateLogin` и `validateRegister` импортируются в `auth.js`, однако **не передаются как middleware**:
```
router.post('/login', authLimiter, validateLogin, ...)
```
— **действительно используется!** Оставляем. Но `express-validator` и `joi` в зависимостях — `joi` **не импортируется нигде**.

### 2.7 `joi` в backend/package.json — неиспользуемая зависимость (LOW)

`joi` ^17.11.0 объявлена в dependencies, но grep показывает **0 импортов** по всему бэкенду.
Валидация идёт через `express-validator`.

**Рекомендация**: `npm uninstall joi` из backend.

---

## 3. Дублирование и избыточность

### 3.1 Два компонента подтверждения: `ConfirmDialog.tsx` и `ConfirmModal.tsx` (HIGH)

- `ConfirmDialog.tsx` — imperative API (`await confirmDialog(opts)`), используется в 6 компонентах через `confirmDialog()` import
- `ConfirmModal.tsx` — declarative API (`<ConfirmModal open={} onConfirm={} />`), используется в 4 компонентах

Два разных паттерна для одной и той же задачи. Кроме того, `HROnboarding.tsx:858` определяет **свой собственный** третий `ConfirmModal` локально!

**Рекомендация**: выбрать один паттерн (императивный `confirmDialog` проще и уже доминирует), убрать `ConfirmModal.tsx`, рефакторить `HROnboarding.tsx`.

### 3.2 `formatFileSize` в двух местах (MEDIUM)

См. 2.4. Две разные реализации с разным поведением округления.

**Рекомендация**: оставить одну в `shared/lib/documentUtils.ts`, обновить импорты.

### 3.3 `modulesStore.ts`: `loaded` и `modulesLoaded` (LOW)

Два поля с одним и тем же смыслом (`loaded` и `modulesLoaded`), оба `true`/`false` одновременно, ставятся вместе.

**Рекомендация**: оставить одно (`loaded`), убрать `modulesLoaded`.

---

## 4. Проблемы архитектуры

### 4.1 Отсутствие `apiClient` — 30+ сырых fetch-вызовов (MEDIUM)

Каждый сервисный файл (vacationApi.ts, surveyApi.ts, assistantApi.ts) повторяет один и тот же паттерн:
```typescript
const res = await fetch(`${API_BASE_URL}/path`, {
  method: 'POST',
  headers: getAuthHeadersWithContentType(),
  body: JSON.stringify(data),
})
if (!res.ok) throw new Error((await res.json()).error || 'Ошибка')
return res.json()
```

**Рекомендация**: создать `shared/lib/apiClient.ts` с обёртками `apiGet()`, `apiPost()`, `apiPut()`, `apiDelete()`.

### 4.2 Отсутствие `useAsyncAction` хука (MEDIUM)

Почти каждый компонент повторяет:
```typescript
const [loading, setLoading] = useState(false)
const [error, setError] = useState<string | null>(null)
```

**Рекомендация**: создать `shared/hooks/useAsyncAction.ts`.

### 4.3 Нет Error Boundary на уровне роутов (HIGH)

`ErrorBoundary.tsx` существует в `shared/components/`, но нужно проверить, обёрнуты ли `<Route>` элементы. Без этого любая ошибка в компоненте крашит всё приложение.

### 4.4 Устаревшие документация (MEDIUM)

`CLAUDE.md` описывает старую плоскую структуру (`pages/`, `components/`, `store/`, `lib/`), а реальная архитектура — `shared/`, `core/`, `modules/`. Импортные пути в примерах (`@/lib/api`) тоже устарели — сейчас `@/shared/lib/api`.

---

## 5. Безопасность

### 5.1 `httpntlm` с `rejectUnauthorized: false` (MEDIUM)

`ewsService.js:244` и `:262` — HTTPS-агент с отключенной верификацией сертификатов.

**Рекомендация**: сделать настраиваемым через env-переменную (`EWS_REJECT_UNAUTHORIZED=true`).

### 5.2 EWS логирует учётные данные (HIGH)

`ewsService.js:323`:
```javascript
console.log('[EWS] NTLM auth to:', ewsUrl, 'user:', username, 'domain:', domain || '(none)')
```
Логирует username в cleartext. В production это попадает в логи.

**Рекомендация**: убрать или заменить на `user: ${username.substring(0, 2)}***`.

### 5.3 `apiLimiter` не подключён (MEDIUM)

`rateLimiter.js` экспортирует `apiLimiter`, но он **нигде не используется** в `server.js` или роутах.
Rate limiting применяется только к auth-endpoints через `authLimiter`.

**Рекомендация**: подключить `apiLimiter` как middleware в `server.js` для `/api` routes, или удалить если не нужен.

### 5.4 CSRF токен — логирование не предусмотрено (LOW)

CSRF middleware возвращает 403 без логирования, что затрудняет отладку ложных срабатываний.

---

## 6. Backend: проблемы и улучшения

### 6.1 `backend/src/services/ewsService.js` — XML-парсинг regex-ами (MEDIUM)

346 строк парсинга SOAP/XML через regex (`extractTag`, `extractAttr`). Хрупко, может сломаться на вложенных тегах или атрибутах.
Но работает для конкретного Exchange ответа.

**Рекомендация**: при первой поломке заменить на `fast-xml-parser`.

### 6.2 `notifyBatch` — последовательные запросы (LOW)

`notifications.js:44-47`: `notifyBatch` отправляет уведомления в цикле `for...of` по одному.
При большом количестве пользователей — медленно.

**Рекомендация**: использовать `Promise.allSettled()` или batch INSERT.

### 6.3 `surveyService.js` — N+1 запросы в аналитике (MEDIUM)

`getSurveyAnalytics` выполняет отдельный SELECT для каждого вопроса (строка 62-118).
При 20 вопросах — 20+ SQL запросов.

**Рекомендация**: один запрос с JOIN или CTE.

### 6.4 Нет тестов для notification-service (LOW)

`notification-service/` — отдельный микросервис, но нет тестов.

### 6.5 `backend/src/db/default-vacation-templates.js` — 343 строки XML в JS (LOW)

XML-шаблоны документов встроены в JS-код. Работает, но сложно поддерживать.

**Рекомендация**: вынести `.docx` шаблоны в `backend/src/db/templates/` как статические файлы.

---

## 7. Frontend: улучшения

### 7.1 Нет глобального loading skeleton (MEDIUM)

Большинство страниц показывают пустое пространство при загрузке. `Skeleton.tsx` существует, но не используется.

### 7.2 Мобильная адаптивность (MEDIUM)

Sidebar не адаптирован для мобильных — нет hamburger menu, overlay sidebar.

### 7.3 Нет optimistic updates (LOW)

Все мутации ждут ответ сервера. Для переключателей и простых действий можно использовать optimistic updates.

### 7.4 Модуль vacation — 8 модальных окон (OBSERVATION)

`modules/vacation/components/modals/` содержит 8 файлов модалок. Это много, но каждая решает свою задачу. Оставить.

---

## 8. Git и репозиторий

### 8.1 Устаревшие remote-ветки (MEDIUM)

- `origin/001-worker-vacation` — слита в main
- `origin/draft-frontend-1` — мёртвая (2 коммита)
- `origin/feature/hr-panel` — не слита (4 коммита)

**Рекомендация**: удалить слитые/мёртвые, решить судьбу `feature/hr-panel`.

### 8.2 Нет тегов (LOW)

501+ коммитов, 0 тегов. Нет версионирования.

---

## 9. `.dockerignore` — неполный (MEDIUM)

Отсутствуют: `*.png`, `*.jpg`, `docker/`, `.opencode/`, `.playwright-mcp/`, `hermes-webui/`.
Docker build context получает лишние файлы.

---

## 10. Зависимости: аудит

### 10.1 Неиспользуемые

| Зависимость | Где | Действие |
|---|---|---|
| `joi` ^17.11.0 | backend/package.json | Удалить (0 импортов) |
| `@playwright/test` | root devDependencies | Оставить (e2e тесты) |

### 10.2 Дублированные

| Зависимость | root | backend | Обоснование |
|---|---|---|---|
| `dompurify` ^3.4.11 | ✅ | ✅ | Frontend: sanitize HTML. Backend: sanitize docx templates. Корректно. |
| `@types/dompurify` | ✅ | ✅ | Для каждого своя TS-среда. Корректно. |

---

## Приоритизированный план действий

| # | Приоритет | Действие |
|---|---|---|
| 1 | HIGH | Удалить 12 `dark-*.png` из репозитория |
| 2 | HIGH | Добавить `.playwright-mcp/` в `.gitignore` и `git rm --cached` |
| 3 | HIGH | Объединить `ConfirmDialog` и `ConfirmModal` в один компонент |
| 4 | HIGH | Убрать логирование username в `ewsService.js:323` |
| 5 | HIGH | Удалить `shared/store/departmentsStore.ts` |
| 6 | MEDIUM | Удалить `joi` из backend/package.json |
| 7 | MEDIUM | Удалить дублирующий `formatFileSize` из `mockData.ts` |
| 8 | MEDIUM | Подключить или удалить `apiLimiter` |
| 9 | MEDIUM | Обновить `CLAUDE.md` под реальную архитектуру `shared/core/modules/` |
| 10 | MEDIUM | Создать `shared/lib/apiClient.ts` для устранения boilerplate |
| 11 | MEDIUM | Удалить устаревшие remote-ветки |
| 12 | MEDIUM | Добавить `docker/hermes/data/skills/` в `.gitignore` |
| 13 | LOW | Удалить `Skeleton.tsx`, `ContextMenu.tsx` (или начать использовать) |
| 14 | LOW | Убрать `modulesLoaded` из `modulesStore.ts` |
| 15 | LOW | Переименовать `mockData.ts` → `requestUtils.ts`, `constants.ts` → `avatarColors.ts` |
