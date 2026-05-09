# Модуль: Документы

## Основная информация

- **Код**: `documents`
- **Категория**: `docs`
- **Маршрут**: `/documents`
- **Иконка**: `FolderOpen`
- **Сортировка**: 40
- **Описание**: Загрузка и хранение личных документов сотрудника

## Файловая структура

```
modules/documents/
└── pages/
    └── Documents.tsx
```

## API эндпоинты

**Файлы**: `backend/src/routes/documents.js` (82 строки), `backend/src/routes/userDocuments.js` (280 строк)

### Документы проектов (агрегация)

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/documents/` | all | Документы из проектов пользователя |

### Личные документы

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/user-documents/` | all | Мои документы |
| POST | `/api/user-documents/` | all | Загрузить документ (multipart) |
| GET | `/api/user-documents/:id/download` | all: свой | Скачать |
| GET | `/api/user-documents/:id/preview` | all: свой | Превью |
| DELETE | `/api/user-documents/:id` | all: свой | Удалить |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | Свои документы |
| manager | Свои документы |
| hr | Свои документы |
| admin | Свои документы |
| onboarding | Заблокировано (BlockOnboardingRoute) |

## Зависимости

**Frontend**:
- `@/shared/lib/*`
- `@/shared/components/ui/*`
- `@/shared/store/modulesStore`

**Backend**:
- MinIO S3
- `multer`
