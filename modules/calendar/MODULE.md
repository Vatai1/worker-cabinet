# Модуль: Календарь

## Основная информация

- **Код**: `calendar`
- **Категория**: `admin`
- **Маршрут**: `/calendar`
- **Иконка**: `CalendarDays`
- **Сортировка**: 90
- **Описание**: Интеграция с Outlook (Graph API и EWS)

## Файловая структура

```
modules/calendar/
└── pages/
    └── CalendarPage.tsx
```

## API эндпоинты

**Файл**: `backend/src/routes/calendar.js` (307 строк)

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/calendar/auth/url` | all | URL для OAuth2 авторизации |
| GET | `/api/calendar/auth/callback` | public | OAuth2 callback (обмен кода на токен) |
| GET | `/api/calendar/status` | all | Статус подключения |
| POST | `/api/calendar/ews/connect` | all | Подключение через EWS |
| DELETE | `/api/calendar/ews/disconnect` | all | Отключить EWS |
| GET | `/api/calendar/events` | all | Список событий |
| GET | `/api/calendar/ews/event-body/:id` | all | Содержимое события EWS |
| DELETE | `/api/calendar/disconnect` | all | Отключить Graph API |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | Подключение и просмотр своего календаря |
| manager | Подключение и просмотр своего календаря |
| hr | Подключение и просмотр своего календаря |
| admin | Подключение и просмотр своего календаря |
| onboarding | Заблокировано (BlockOnboardingRoute) |

## Зависимости

**Frontend**:
- `@/shared/lib/*`
- `@/shared/components/ui/*`
- `@/shared/store/modulesStore`

**Backend**:
- `backend/src/services/ewsService.js` (encrypt, decrypt, fetchEwsEvents, testEwsConnection)
- Microsoft Graph API (OAuth2)
