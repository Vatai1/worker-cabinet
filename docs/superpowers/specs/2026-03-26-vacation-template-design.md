# Vacation Statement Template — Design Spec

**Date:** 2026-03-26
**Status:** Approved

## Overview

HR загружает DOCX-шаблон заявления на отпуск через существующую страницу управления шаблонами и назначает его активным для генерации. При нажатии кнопки «Скачать заявление» на странице отпусков система подставляет данные сотрудника в шаблон и возвращает готовый DOCX.

## Что удаляется

Из `backend/src/services/statementService.js` полностью убираются:

- `createDefaultTemplate()` — генерация встроенного шаблона из XML
- `ensureBucketExists()` — проверка/создание S3 bucket
- `loadTemplate()` — загрузка по захардкоженному пути `templateDocuments/vacation_statement.docx`
- `saveStatement()` — сохранение сгенерированного документа обратно в S3

Импорты `HeadBucketCommand`, `CreateBucketCommand`, `HeadObjectCommand`, `PutObjectCommand` из `@aws-sdk/client-s3` — убрать.

## Database

Добавить в `backend/src/db/migrate.js` перед `console.log('✅ Migrations completed successfully')`:

```js
await db.query(`ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS purpose TEXT`)
  .catch(e => console.log('  - document_templates.purpose:', e.message))
console.log('  ✓ document_templates.purpose')

await db.query(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_dt_purpose
  ON document_templates (purpose)
  WHERE purpose IS NOT NULL
`).catch(e => console.log('  - idx_dt_purpose:', e.message))
console.log('  ✓ idx_dt_purpose')
```

`purpose = 'vacation_statement'` у одной строки означает, что этот шаблон используется для генерации заявлений на отпуск. Partial unique index гарантирует, что активным может быть только один.

## Backend

### `PUT /api/templates/:id/purpose`

- Middleware: `authenticateToken`, `authorizeRoles('hr', 'admin')`
- Body: `{ purpose: 'vacation_statement' }` — установить, `{ purpose: null }` — снять
- Логика установки:
  ```sql
  -- Снять purpose у текущего активного
  UPDATE document_templates SET purpose = NULL WHERE purpose = $1
  -- Установить у нового
  UPDATE document_templates SET purpose = $1 WHERE id = $2 RETURNING *
  ```
- Логика снятия (`purpose === null`):
  ```sql
  UPDATE document_templates SET purpose = NULL WHERE id = $1 RETURNING *
  ```
- Validate: `purpose` должен быть `'vacation_statement'` или `null` — иначе `400 { "error": "Недопустимое значение purpose" }`
- On success: `200 { ...template }`
- On DB error: `500 { "error": "Ошибка обновления шаблона" }`

### `backend/src/services/statementService.js` — рефакторинг `generateVacationStatement`

Заменить вызов `loadTemplate()` на запрос к БД:

```js
const tmpl = await query(
  'SELECT file_key FROM document_templates WHERE purpose = $1',
  ['vacation_statement']
)
if (tmpl.rows.length === 0) {
  throw new Error('Шаблон заявления не установлен. Обратитесь к кадровому сотруднику')
}
const response = await getFromS3(tmpl.rows[0].file_key)
const buf = await response.Body.transformToByteArray()
const templateBuffer = Buffer.from(buf)
```

Остальная логика (`fixTemplateTags`, `docxtemplater`, формирование `templateData`) остаётся без изменений. Функция возвращает `buffer`, не сохраняя его в S3.

### `GET /api/templates` — обновить SELECT

Добавить `purpose` в список возвращаемых полей:

```sql
SELECT id, name, description, category, mime_type as "mimeType",
       size, download_count as "downloadCount", created_at as "createdAt",
       file_key as "fileKey", purpose
FROM document_templates
ORDER BY created_at DESC
```

### `vacation.js` — без изменений

`error.message` уже пробрасывается клиенту на строке 1143:
```js
res.status(500).json({ error: error.message || 'Ошибка при генерации заявления' })
```

## Frontend

### `types/index.ts` (или где объявлен `DocumentTemplate`)

Добавить поле `purpose?: string | null` к интерфейсу `DocumentTemplate`.

### `pages/HRDocumentTemplates.tsx`

В карточке каждого шаблона:

1. Если `template.purpose === 'vacation_statement'`:
   - Бейдж «Шаблон заявлений» (зелёный)
   - Кнопка «Снять» → `PUT /api/templates/:id/purpose` с `{ purpose: null }`

2. Если `template.purpose` не установлен **и** файл `.docx` (`mimeType` содержит `wordprocessingml`):
   - Кнопка «Установить как шаблон заявлений» → `PUT /api/templates/:id/purpose` с `{ purpose: 'vacation_statement' }`

После успешного ответа — обновить список шаблонов (перезапросить GET /api/templates).

### Страница отпусков — без изменений

Кнопка «Скачать заявление» уже вызывает существующий endpoint. Ошибка «Шаблон заявления не установлен...» отобразится через существующую обработку ошибок на фронте.

## Error Handling

| Случай | Поведение |
|--------|-----------|
| `purpose` не в допустимых значениях | `400 { "error": "Недопустимое значение purpose" }` |
| DB error в PUT purpose | `500 { "error": "Ошибка обновления шаблона" }` |
| Шаблон не установлен при генерации | `500 { "error": "Шаблон заявления не установлен. Обратитесь к кадровому сотруднику" }` |
| Шаблон в S3 недоступен | `500 { "error": "..." }` — ошибка S3 пробрасывается |

## Out of Scope

- Разные шаблоны для разных типов отпусков
- Предпросмотр шаблона перед назначением
- Редактирование плейсхолдеров через UI
