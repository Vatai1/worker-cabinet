# Модуль: Отпуска

## Основная информация

- **Код**: `vacation`
- **Категория**: `hr`
- **Маршрут**: `/vacation`
- **Иконка**: `Plane`
- **Сортировка**: 10
- **Описание**: Управление отпусками, балансы, заявления, ограничения

## Файловая структура

```
modules/vacation/
├── types/vacation.ts
├── services/vacationApi.ts
├── store/vacationStore.ts
├── data/mockVacationData.ts
├── pages/
│   ├── Vacation.tsx
│   └── HRVacationCalendar.tsx
└── components/modals/
    ├── VacationTransferApplicationModal.tsx
    ├── VacationTransferModal.tsx
    ├── VacationApplicationModal.tsx
    ├── RestrictionModal.tsx
    ├── VacationHistoryModal.tsx
    ├── VacationDetailModal.tsx
    ├── CreateVacationModal.tsx
    └── CreateVacationFormModal.tsx
```

## API эндпоинты

**Файл**: `backend/src/routes/vacation.js` (2307 строк)

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/vacation/requests` | all | Список заявок (employee: свои, manager: отдел, hr/admin: все) |
| GET | `/api/vacation/balance/:userId` | employee: свой | Баланс отпусков |
| POST | `/api/vacation/requests` | all | Создать заявку |
| PUT | `/api/vacation/requests/:id` | employee: своя, статус on_approval | Редактировать заявку |
| POST | `/api/vacation/requests/:id/approve` | manager, hr, admin | Одобрить заявку |
| POST | `/api/vacation/requests/:id/reject` | manager, hr, admin | Отклонить заявку |
| POST | `/api/vacation/requests/:id/cancel` | all: своя | Отменить заявку |
| POST | `/api/vacation/requests/:id/cancel-by-manager` | manager, hr, admin | Отмена руководителем |
| POST | `/api/vacation/requests/:id/transfer` | all: своя | Перенос отпуска |
| POST | `/api/vacation/requests/:id/transfer/approve` | manager, hr, admin | Одобрить перенос |
| POST | `/api/vacation/requests/:id/transfer/reject` | manager, hr, admin | Отклонить перенос |
| POST | `/api/vacation/requests/:id/transfer/cancel` | all: своя | Отменить перенос |
| GET | `/api/vacation/calendar` | all | Календарь отпусков |
| GET | `/api/vacation/restrictions` | manager, hr, admin | Список ограничений |
| POST | `/api/vacation/restrictions` | manager, hr, admin | Создать ограничение |
| DELETE | `/api/vacation/restrictions/:id` | manager, hr, admin | Удалить ограничение |
| POST | `/api/vacation/check-restrictions` | all | Проверка ограничений |
| GET | `/api/vacation/my-transferable` | all | Переносимые отпуска |
| GET | `/api/vacation/my-transfer-requests` | all | Заявки на перенос |
| POST | `/api/vacation/generate-application` | all | Генерация заявления (docx) |
| POST | `/api/vacation/generate-transfer-application` | all | Генерация заявления на перенос |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | Свои заявки, баланс, создание, отмена, генерация заявлений |
| manager | Заявки отдела, одобрение/отклонение, ограничения |
| hr | Все заявки, полное управление |
| admin | Все заявки, полное управление |
| onboarding | Заблокировано (BlockOnboardingRoute) |

## Зависимости

**Frontend**:
- `@/core/auth/store/authStore`
- `@/shared/store/modulesStore`
- `@/shared/lib/utils` (formatDate, getErrorMessage, cn)
- `@/shared/lib/api` (API_BASE_URL)
- `@/shared/lib/authHeaders`
- `@/shared/components/ui/*`

**Backend**:
- `docxtemplater`, `pizzip` (генерация docx)
- MinIO S3 (хранение шаблонов и документов)
