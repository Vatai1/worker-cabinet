# Модуль: Инвентаризация

## Основная информация

- **Код**: `inventory`
- **Категория**: `work`
- **Маршрут**: `/inventory`
- **Иконка**: `Boxes`
- **Сортировка**: 45
- **Описание**: Учёт оборудования, мебели и материальных ценностей

## Файловая структура

```
modules/inventory/
├── pages/
│   └── Inventory.tsx
├── components/
│   ├── ItemModal.tsx
│   ├── SectionModal.tsx
│   ├── AssignModal.tsx
│   └── HistoryModal.tsx
└── types.ts

shared/store/inventorySectionsStore.ts — список разделов для сайдбара
```

## Навигация

В сайдбаре «Инвентаризация» — сворачиваемый список:

- **Каталог** → `/inventory?tab=catalog`
- **Моё имущество** → `/inventory?tab=my`
- **Созданные разделы** (динамически из `/inventory/sections`) → `/inventory?section=<id>` — каталог с фильтром и колонками характеристик
- **Настройки** (только hr, admin) → `/inventory?tab=sections` — конструктор разделов

Страница читает query-параметры `tab` и `section`; после изменения разделов стор `inventorySectionsStore` обновляет сайдбар.

## Предметная область

Учёт материальных ценностей организации с историей движений и **конструктором разделов**:

- **Разделы** (АРМ, Мебель, Оргтехника, Бытовая техника, Оборудование, Прочее) — настраиваются HR/админом: название, описание, сортировка и **схема полей характеристик**
- **Конструктор полей раздела** — типы: текст, число (с единицей измерения), дата, список (с вариантами), да/нет; признак обязательности; порядок полей
- **Позиции** — базовые поля (наименование, инвентарный номер, серийный номер, состояние, кабинет, дата покупки, стоимость, примечание) + значения кастомных полей раздела (`field_values`), валидируемые по схеме на бэкенде
- **Статусы позиции**: `in_stock` (на складе), `assigned` (выдано), `repair` (в ремонте), `written_off` (списано)
- **Движения** — журнал выдач/возвратов/смен статуса с комментарием и автором операции
- **Моё имущество** — вкладка работника с позициями, выданными ему

## API эндпоинты

**Файл**: `backend/src/routes/inventory.js`

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/inventory/sections` | all | Разделы со схемой полей и количеством позиций |
| POST | `/api/inventory/sections` | hr, admin | Создать раздел с полями (конструктор) |
| PUT | `/api/inventory/sections/:id` | hr, admin | Обновить раздел, схема полей заменяется целиком |
| DELETE | `/api/inventory/sections/:id` | hr, admin | Удалить раздел (409, если есть позиции) |
| GET | `/api/inventory/items` | all | Список позиций: `search`, `section_id`, `status`, `mine=1` |
| POST | `/api/inventory/items` | hr, admin | Создать позицию, `field_values` валидируются по схеме |
| GET | `/api/inventory/items/:id` | all | Позиция по ID |
| PUT | `/api/inventory/items/:id` | hr, admin | Обновить позицию |
| DELETE | `/api/inventory/items/:id` | admin | Удалить позицию (с историей) |
| POST | `/api/inventory/items/:id/assign` | hr, admin | Выдать работнику (только со склада) |
| POST | `/api/inventory/items/:id/return` | hr, admin | Принять обратно на склад |
| POST | `/api/inventory/items/:id/status` | hr, admin | Смена статуса: repair / written_off / in_stock |
| GET | `/api/inventory/items/:id/movements` | all | История движений позиции |
| GET | `/api/inventory/my` | all | Моё имущество |
| GET | `/api/inventory/stats` | hr, admin, manager | Статистика по статусам, разделам, стоимости |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | Каталог, «Моё имущество», история позиций |
| manager | То же + статистика |
| hr | Полное управление позициями, выдача/возврат, категории |
| admin | Всё, включая удаление позиций |
| onboarding | Нет (BlockOnboardingRoute) |

## Таблицы БД

- `inventory_sections` — разделы с конструктором полей (code, name, description, icon, field_schema JSONB, is_active)
- `inventory_items` — позиции (inventory_number UNIQUE, section_id, field_values JSONB, status, condition, assigned_to → users, organization_id)
- `inventory_movements` — журнал движений (item_id → inventory_items CASCADE, action, from/to status, performed_by → users)

## Зависимости

**Frontend**:
- `@/shared/lib/apiClient`, `@/shared/lib/permissions`, `@/shared/lib/utils`
- `@/shared/components/ui/*` (EntityModal, DataTable, SelectDropdown, Badge)

**Backend**:
- `../middleware/auth.js` (authenticateToken, authorizeRoles)
- `../middleware/errors.js`, `../config/database.js`
