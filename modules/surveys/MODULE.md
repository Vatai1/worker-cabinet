# Модуль: Опросы

## Основная информация

- **Код**: `surveys`
- **Категория**: `hr`
- **Маршрут**: `/surveys`
- **Иконка**: `ClipboardList`
- **Сортировка**: 20
- **Описание**: Создание и прохождение опросов

## Файловая структура

```
modules/surveys/
├── types/survey.ts
├── store/surveyStore.ts
├── services/surveyApi.ts
├── pages/
│   ├── Surveys.tsx
│   ├── SurveyPage.tsx
│   └── HRSurveys.tsx
└── components/modals/
    ├── SurveyAnalyticsModal.tsx
    └── SurveyBuilderModal.tsx
```

## API эндпоинты

**Файл**: `backend/src/routes/surveys.js` (537 строк)

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/surveys/` | hr, admin | Список всех опросов |
| GET | `/api/surveys/my` | all | Доступные мне опросы |
| GET | `/api/surveys/:id` | hr, admin | Детали опроса |
| POST | `/api/surveys/` | hr, admin | Создать опрос |
| PUT | `/api/surveys/:id` | hr, admin | Обновить опрос |
| DELETE | `/api/surveys/:id` | hr, admin | Удалить опрос |
| POST | `/api/surveys/:id/publish` | hr, admin | Опубликовать |
| POST | `/api/surveys/:id/close` | hr, admin | Закрыть |
| GET | `/api/surveys/:id/view` | all | Просмотр для прохождения |
| POST | `/api/surveys/:id/respond` | all | Отправить ответы |
| GET | `/api/surveys/:id/analytics` | hr, admin | Аналитика опроса |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | Просмотр и прохождение целевых опросов |
| manager | Просмотр и прохождение целевых опросов |
| hr | Создание, управление, аналитика |
| admin | Создание, управление, аналитика |
| onboarding | Нет (нет ModuleGuard, ProtectedRoute) |

## Зависимости

**Frontend**:
- `@/shared/lib/utils`
- `@/shared/lib/api`
- `@/shared/lib/authHeaders`
- `@/shared/components/ui/*`
- `@/shared/store/modulesStore`

**Backend**:
- `backend/src/services/surveyService.js` (isUserInTarget, publishSurvey, getSurveyAnalytics)
