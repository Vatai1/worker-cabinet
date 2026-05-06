# План: Баланс отпуска по годам

## Цель
Разделить баланс отпускных дней по годам. Каждый год имеет свой баланс (например, 47 дней в 2025, 50 дней в 2026).

## Ключевые решения
- Год отпуска определяется по дате начала (календарный год 1 янв - 31 дек)
- Межгодовой перенос запрещён
- Отпуск через границу года запрещён
- 47 дней по умолчанию, HR может изменять каждому сотруднику

---

## 1. База данных (backend/src/db/migrate.js)

### Изменения в таблице vacation_balances:
```sql
-- Было:
user_id INTEGER UNIQUE NOT NULL
total_days INTEGER DEFAULT 28

-- Станет:
user_id INTEGER NOT NULL
year INTEGER NOT NULL
total_days INTEGER DEFAULT 47
UNIQUE(user_id, year)
```

### Миграция существующих данных:
1. Добавить колонку `year`
2. Для каждой записи установить year = YEAR(CURRENT_DATE)
3. Перенести existing values (total_days, used_days, available_days, reserved_days)
4. Удалить UNIQUE с user_id, добавить UNIQUE(user_id, year)

---

## 2. Backend API (backend/src/routes/vacation.js)

### GET /balance/:userId → GET /balance/:userId/:year
- Возвращать баланс за конкретный год
- Если баланса нет — создать с total_days = 47

### POST /requests (создание заявки):
- Добавить проверку: `YEAR(start_date) === YEAR(end_date)`
- Ошибка: "Отпуск не может пересекать границу года"
- Определить год по start_date
- Проверять и списывать из баланса за этот год

### POST /requests/:id/transfer (перенос):
- Добавить проверку: `YEAR(new_start_date) === YEAR(original_start_date)`
- Ошибка: "Перенос в другой год запрещён"
- Использовать баланс того же года

### POST /requests/:id/approve:
- Определить год по start_date
- Обновить баланс за этот год

### POST /requests/:id/cancel:
- Определить год по start_date
- Вернуть дни в баланс за этот год

### POST /requests/:id/reject:
- Определить год по start_date
- Вернуть дни в баланс за этот год

---

## 3. Frontend Types (types/vacation.ts)

```typescript
export interface VacationBalance {
  userId: string
  year: number  // Добавить
  totalDays: number
  usedDays: number
  availableDays: number
  reservedDays: number
  // ...остальное
}
```

---

## 4. Frontend API (services/vacationApi.ts)

```typescript
// Было:
async getBalance(userId: string): Promise<VacationBalance>

// Станет:
async getBalance(userId: string, year: number): Promise<VacationBalance>
```

---

## 5. Frontend UI (pages/Vacation.tsx)

- Загружать баланс за выбранный год (из календаря)
- При переключении года — перезагружать баланс
- Показывать год в карточке баланса: "Баланс на 2025 год"

---

## 6. VacationTransferModal.tsx

Добавить валидацию:
```typescript
const originalYear = new Date(request.startDate).getFullYear()
const newYear = new Date(newStartDate).getFullYear()
if (newYear !== originalYear) {
  newErrors.newStartDate = 'Перенос в другой год запрещён'
}
```

---

## 7. HR: Управление балансами (опционально, можно позже)

Новый эндпоинт:
- PUT /balance/:userId/:year — установить total_days для сотрудника на год

Новый UI для HR:
- Страница со списком сотрудников и их балансами по годам
- Возможность изменить total_days

---

## Порядок реализации

1. **База данных** — изменить схему, написать миграцию
2. **Backend API** — обновить все эндпоинты
3. **Frontend types** — обновить интерфейсы
4. **Frontend API** — обновить vacationApi
5. **Frontend UI** — обновить Vacation.tsx
6. **Frontend Transfer Modal** — добавить валидацию
7. **Тесты** — проверить сценарии
8. **Lint/Typecheck** — проверить код
