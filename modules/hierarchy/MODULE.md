# Модуль: Иерархия

## Основная информация

- **Код**: `hierarchy`
- **Категория**: `admin`
- **Маршрут**: `/hr/hierarchy`
- **Иконка**: `Network`
- **Сортировка**: 70
- **Описание**: Организационная структура компании

## Файловая структура

```
modules/hierarchy/
├── pages/
│   └── HRHierarchy.tsx
└── components/
    └── DepartmentHierarchyOverlay.tsx
```

## API эндпоинты

**Файл**: `backend/src/routes/hierarchy.js` (181 строка)

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/hierarchy/` | all | Полная иерархия (ReactFlow данные) |
| PUT | `/api/hierarchy/` | hr, admin | Сохранить иерархию |
| GET | `/api/hierarchy/department/:id` | all | Иерархия отдела |
| PUT | `/api/hierarchy/department/:id` | hr, admin | Сохранить иерархию отдела |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | Просмотр (внутри HRPanel) |
| manager | Просмотр |
| hr | Просмотр + редактирование |
| admin | Просмотр + редактирование |
| onboarding | Нет (HRRoute) |

## Зависимости

**Frontend**:
- `@xyflow/react` (ReactFlow)
- `@/shared/lib/*`
- `@/shared/components/ui/*`

**Backend**:
- Нет специальных зависимостей
