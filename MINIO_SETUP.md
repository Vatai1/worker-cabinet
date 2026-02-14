# MinIO S3 Storage Setup

## Настройка MinIO через Docker Compose

### 1. Запуск MinIO

```bash
cd /Users/vatai/worker-cabinet
docker-compose -f docker-compose.minio.yml up -d
```

### 2. Создание Bucket

1. Откройте MinIO Console: http://localhost:9001
2. Войдите:
   - Username: `minioadmin`
   - Password: `minioadmin123`
3. Создайте новый bucket с именем: `worker-cabinet-docs`
4. **Важно:** Настройте Access Policy:
   - Выберите созданный bucket
   - Нажмите "Access Policy" или "Set Policy"
   - Выберите: `public` (для чтения файлов) или добавьте кастомную политику:

**Custom Policy (если public не работает):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": ["*"]
      },
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::worker-cabinet-docs/*"
    }
  ]
}
```

### 3. Проверка подключения

Backend будет автоматически использовать настройки из `.env`:
- S3_ENDPOINT: http://localhost:9000
- S3_ACCESS_KEY_ID: minioadmin
- S3_SECRET_ACCESS_KEY: minioadmin123
- S3_BUCKET: worker-cabinet-docs

### 4. Перезапуск Backend

```bash
cd /Users/vatai/worker-cabinet/backend
pkill -f "node src/server.js"
nohup node src/server.js > ../logs/backend.log 2>&1 &
```

## Дополнительные настройки

### Изменение учетных данных MinIO

Отредактируйте `/Users/vatai/worker-cabinet/backend/.env`:

```env
# MinIO Credentials (измените на свои)
MINIO_ROOT_USER=your_username
MINIO_ROOT_PASSWORD=your_password

# S3 Settings
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET=your_bucket_name
```

### Использование AWS S3 вместо MinIO

Для перехода на AWS S3:

1. Создайте bucket в AWS Console
2. Создайте IAM пользователя с правами S3FullAccess
3. Получите Access Key и Secret Key
4. Обновите `.env`:

```env
# AWS S3
S3_ENDPOINT=https://s3.amazonaws.com
S3_ACCESS_KEY_ID=your_aws_access_key
S3_SECRET_ACCESS_KEY=your_aws_secret_key
S3_BUCKET=your_aws_bucket_name
S3_REGION=us-east-1
```

## Особенности

- Файлы сохраняются в S3/MinIO с сохранением только URL в базе данных
- Максимальный размер файла: 10MB
- Поддерживаемые форматы: PDF, DOC, DOCX, XLS, XLSX, TXT, ZIP, RAR, 7Z, JPG, PNG, GIF
- URL файлов доступны по ссылке из MinIO: http://localhost:9000/worker-cabinet-docs/file-key
- Имена файлов с кириллицей автоматически кодируются

## Troubleshooting

### Ошибка AccessDenied при скачивании файла

Если при скачивании файла вы видите ошибку `AccessDenied`, настройте политику доступа в MinIO Console:

1. Откройте http://localhost:9001
2. Выберите bucket `worker-cabinet-docs`
3. Нажмите "Access Policy"
4. Выберите `public` или вставьте следующую политику:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {"AWS": "*"},
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::worker-cabinet-docs/*"
    }
  ]
}
```
5. Нажмите "Add"

### МинIO недоступен

Проверьте, что контейнер запущен:
```bash
docker ps | grep minio
```

### Ошибки при загрузке файлов

1. Проверьте, что bucket существует
2. Проверьте учетные данные в `.env`
3. Проверьте логи backend: `tail -f logs/backend.log`

### Файлы не загружаются в S3

1. Проверьте настройки S3_ENDPOINT
2. Убедитесь, что S3 доступен: `curl http://localhost:9000`
3. Проверьте, что MinIO контейнер запущен

### Некорректное отображение кириллицы в именах файлов

Если имена файлов с кириллицей отображаются некорректно, проверьте:
1. Что MinIO Console работает корректно
2. Браузер поддерживает кириллицу в URL (современные браузеры поддерживают)
3. Если проблемы продолжаются, настройте CORS в MinIO Console:
   - Admin → Buckets → worker-cabinet-docs → Edit
   - Добавьте CORS конфигурацию:
   - Allowed Origins: `http://localhost:3000`
   - Allowed Methods: GET, PUT, POST, DELETE
   - Allowed Headers: *

