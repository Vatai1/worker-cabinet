# Модуль: Уведомления

## Основная информация

- **Код**: `notifications`
- **Категория**: `docs`
- **Маршрут**: `/notifications`
- **Иконка**: `Bell`
- **Сортировка**: 100
- **Описание**: Email-уведомления о событиях в системе

## Файловая структура

```
modules/notifications/
└── pages/
    └── Notifications.tsx
```

## API эндпоинты

**Файл**: `backend/src/routes/notifications.js` (73 строки)

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/notifications/my` | all | Мои уведомления (пагинация) |
| PATCH | `/api/notifications/my/:id/read` | all: своё | Прочитать уведомление |
| PATCH | `/api/notifications/my/read-all` | all | Прочитать все |
| GET | `/api/notifications/my/unread-count` | all | Количество непрочитанных |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | Свои уведомления |
| manager | Свои уведомления |
| hr | Свои уведомления |
| admin | Свои уведомления |
| onboarding | Заблокировано (BlockOnboardingRoute) |

## Особенности

- Уведомления создаются другими модулями через таблицу `notification_queue`
- Microservice `notification-service` обрабатывает очередь (RabbitMQ)

## Зависимости

**Frontend**:
- `@/shared/lib/*`
- `@/shared/components/ui/*`
- `@/shared/store/modulesStore`

**Backend**:
- Таблица `notification_queue` (популируется другими сервисами)
