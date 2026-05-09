# Модуль: Проекты

## Основная информация

- **Код**: `projects`
- **Категория**: `work`
- **Маршрут**: `/projects`
- **Иконка**: `FolderKanban`
- **Сортировка**: 30
- **Описание**: Управление проектами, задачами, документами, roadmaps

## Файловая структура

```
modules/projects/
├── types/project.ts
├── pages/
│   ├── Projects.tsx
│   ├── ProjectDetail.tsx
│   ├── ProjectDocuments.tsx
│   └── ProjectRoadmap.tsx
└── components/modals/
    ├── CreateProjectModal.tsx
    ├── EditProjectModal.tsx
    ├── AddMemberModal.tsx
    ├── MemberProjectInfoModal.tsx
    └── DocumentPreviewModal.tsx
```

## API эндпоинты

**Файл**: `backend/src/routes/projects.js` (2223 строки)

### Проекты

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/projects/` | all | Список проектов |
| GET | `/api/projects/:id` | all | Детали проекта |
| POST | `/api/projects/` | all | Создать проект |
| PUT | `/api/projects/:id` | lead, admin, hr | Обновить проект |
| DELETE | `/api/projects/:id` | creator, admin, hr | Удалить проект |

### Участники

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| POST | `/api/projects/:id/members` | lead, admin, hr | Добавить участника |
| PUT | `/api/projects/:id/members/:userId` | lead, admin, hr, self | Обновить роль участника |
| DELETE | `/api/projects/:id/members/:userId` | lead, admin, hr, self | Удалить участника |

### Документы проекта

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/projects/:id/documents` | all | Список документов |
| POST | `/api/projects/:id/documents` | member, lead, admin, hr | Загрузить документ |
| PUT | `/api/projects/:id/documents/:documentId` | uploader, lead, admin, hr | Обновить документ |
| DELETE | `/api/projects/:id/documents/:documentId` | uploader, lead, admin, hr | Удалить документ |
| PUT | `/api/projects/:id/documents/:documentId/move` | uploader, lead, admin, hr | Переместить документ |
| GET | `/api/projects/:id/documents/:documentId/download` | all | Скачать |
| GET | `/api/projects/:id/documents/:documentId/preview` | all | Превью |
| GET | `/api/projects/:id/documents/:documentId/preview-token` | all | Токен превью |
| GET | `/api/projects/:id/documents/:documentId/public/:token` | public | Публичная ссылка |

### Папки

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/projects/:id/folders` | all | Список папок |
| POST | `/api/projects/:id/folders` | member, admin, hr | Создать папку |
| PUT | `/api/projects/:id/folders/:folderId` | lead, admin, hr | Обновить папку |
| PUT | `/api/projects/:id/folders/:folderId/move` | lead, admin, hr | Переместить папку |
| DELETE | `/api/projects/:id/folders` | lead, admin, hr | Удалить папку |

### Roadmap

| Метод | Путь | Роли | Описание |
|--------|------|------|----------|
| GET | `/api/projects/:id/roadmap` | all | Roadmap |
| POST | `/api/projects/:id/roadmap` | lead, admin, hr | Создать элемент |
| PUT | `/api/projects/:id/roadmap/:itemId` | lead, admin, hr | Обновить элемент |
| DELETE | `/api/projects/:id/roadmap/:itemId` | lead, admin, hr | Удалить элемент |
| PUT | `/api/projects/:id/roadmap/reorder` | lead, admin, hr | Пересортировать |
| GET/POST/PUT/DELETE | `/api/projects/:id/roadmap/rows/*` | lead, admin, hr | Строки roadmap |
| GET/POST/PUT/DELETE | `/api/projects/:id/roadmap/tasks/*` | lead, admin, hr | Задачи roadmap |

## Роли и доступ

| Роль | Доступ |
|------|--------|
| employee | Просмотр проектов, загрузка документов (если участник) |
| manager | lead на своих проектах, управление участниками |
| hr | Полное управление проектами |
| admin | Полное управление проектами |
| onboarding | Заблокировано (BlockOnboardingRoute) |

## Зависимости

**Frontend**:
- `@/shared/lib/*`
- `@/shared/components/ui/*`
- `@/shared/store/modulesStore`
- `@/core/auth/store/authStore`

**Backend**:
- MinIO S3 (upload, download, presigned URLs)
- `jwt` (preview tokens)
- `multer` (file upload middleware)
