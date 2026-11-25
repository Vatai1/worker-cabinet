# Модуль: База знаний

## Основная информация

- **Код**: `knowledge`
- **Категория**: `docs`
- **Маршрут**: `/knowledge`
- **Иконка**: `BookMarked`
- **Сортировка**: `105`
- **Описание**: Статьи, регламенты и инструкции с поиском по категориям

## Файловая структура

```
modules/knowledge/
├── components/
│   └── ArticleEditorModal.tsx
├── pages/
│   ├── KnowledgeBase.tsx
│   └── KnowledgeArticle.tsx
├── services/
│   └── knowledgeApi.ts
└── types.ts
```

## API эндпоинты

**Файл**: `backend/src/routes/knowledge.js`

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/knowledge/categories` | все авторизованные | Список категорий с числом опубликованных статей |
| POST | `/api/knowledge/categories` | hr, admin | Создать категорию |
| PUT | `/api/knowledge/categories/:id` | hr, admin | Переименовать категорию |
| DELETE | `/api/knowledge/categories/:id` | hr, admin | Удалить категорию (статьи остаются без категории) |
| GET | `/api/knowledge/articles` | все авторизованные | Список статей: поиск `q`, фильтр `category` (ID или `none`), `status` (для manage), пагинация |
| POST | `/api/knowledge/articles` | hr, admin | Создать статью (draft/published) |
| GET | `/api/knowledge/articles/:id` | все авторизованные | Статья целиком + инкремент просмотров (черновик — только manage) |
| PUT | `/api/knowledge/articles/:id` | hr, admin | Обновить статью |
| DELETE | `/api/knowledge/articles/:id` | hr, admin | Удалить статью |

Доступ на редактирование определяется правом `knowledge:manage` (по умолчанию — hr; admin/superadmin имеют полный доступ).

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | Чтение опубликованных статей, поиск, категории |
| manager | То же, что employee |
| hr | Всё + право `knowledge:manage`: категории, написание и редактирование статей |
| admin | Всё + право `knowledge:manage` |
| superadmin | Всё + глобальный охват (статьи всех учреждений) |
| onboarding | Нет доступа (маршрут закрыт `BlockOnboardingRoute`) |

## Мультиорганизационность

Категории и статьи привязаны к `organization_id` (NULL = общие для всех учреждений).
Работник видит статьи своего учреждения и общие; создаваемые записи получают `organization_id` активного учреждения.

## Зависимости

**Frontend**:
- `@/shared/lib/apiClient` — apiGet/apiPost/apiPut/apiDelete
- `@/shared/lib/permissions` — useCan('knowledge:manage')
- `@/shared/components/ui/*` — Button, Input, Badge, Card, SelectDropdown
- `@/shared/components/PageBanner`

**Backend**:
- `../lib/permissions.js` — requirePermission, hasPermission
- `../lib/orgQuery.js` — currentOrgId
- Таблицы: `knowledge_categories`, `knowledge_articles`

## Тесты

`backend/src/tests/knowledge.test.js` — категории (CRUD + права), статьи (видимость черновиков, поиск, счётчик просмотров, удаление).
