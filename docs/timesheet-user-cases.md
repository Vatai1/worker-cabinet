# Пользовательские сценарии табелей

Браузерные сценарии работают с настоящим API и отдельными работниками и отделами. Данные создаются через API; HTTP-запросы не подменяются. Для воспроизводимости текущий день временно задаётся рабочим через производственный календарь, после сценария восстанавливается его прежний тип. Запускать на тестовой БД.

| Сценарий | Ожидаемый результат | Покрытие |
| --- | --- | --- |
| UC-01. Начальник заполняет день | Согласованный отпуск виден автоматически; неполный день не отправляется | `e2e/timesheet/timesheet.spec.ts`, `backend/src/tests/timesheet.test.js` |
| UC-01. Отправка HR | Отметки фиксируются, кнопка отправки и редактирование исчезают; сервер отклоняет последующие правки | Те же тесты |
| UC-01. Возврат и исправление | HR обязан указать причину; начальник получает уведомление, переходит из него к своему табелю и переотправляет исправление | Те же тесты |
| UC-01. Принятие | HR принимает повторную отправку; ревизия увеличивается, отпуск и исправленные отметки сохраняются | Те же тесты |
| UC-02. Настройки сотрудников | Массовое включение и отключение почасового учёта; номера уникальны в учреждении; при ошибке вся операция отменяется | `e2e/timesheet/timesheet.spec.ts`, `backend/src/tests/timesheet-employee-settings.test.js` |
| UC-02. Часы и неявка | Для явки почасового работника нужны часы; «НН» сохраняется без часов; месячный итог и Excel содержат часы и минуты; PDF содержит Unicode-шрифт | `e2e/timesheet/timesheet.spec.ts`, `backend/src/tests/timesheet-features.test.js`, `backend/src/tests/timesheet.test.js` |
| UC-03. Импорт 0504421 | Неизвестный номер отклоняется без создания работников; известный номер импортирует отметки и часы до 15-го числа включительно | `e2e/timesheet/timesheet.spec.ts`, `backend/src/tests/timesheet-import.test.js`, `backend/src/tests/timesheet-features.test.js` |
| UC-03. Версии и журнал | Корректировка не изменяет старую версию; журнал показывает импорт и создание версии; выбранная версия сохраняется между вкладками; страницы журнала не пропускают и не повторяют события | `e2e/timesheet/timesheet.spec.ts`, `backend/src/tests/timesheet-features.test.js` |
| UC-04. Руководители и замещение | Доступ возникает после назначения; замещение действует только после согласования отпуска и прекращается после отмены; скрытая кнопка не удаляет API | `e2e/timesheet/timesheet.spec.ts`, `backend/src/tests/timesheet-features.test.js` |
| Разделение учреждений и ролей | Чужие работники, табели, журнал и настройки недоступны; отправитель не принимает собственный день | `backend/src/tests/timesheet.test.js`, `backend/src/tests/timesheet-employee-settings.test.js` |
| Перевод работника | Старые утверждённые отметки сохраняются, оставшийся период содержит подпись о переводе в интерфейсе и Excel | `backend/src/tests/timesheet.test.js` |
| Фоновые задания и почта | Автосоздание учитывает переключатель; напоминания учитывают время, отправленные дни и отсутствие дублей; письмо доставляется на тестовый SMTP | `backend/src/tests/timesheet.test.js`, `backend/src/tests/timesheet-features.test.js`, `backend/src/tests/notification-delivery.test.js` |

Браузерные сценарии: `npx playwright test e2e/timesheet/timesheet.spec.ts --workers=1`.

Проверки API: `cd backend && node --test --test-concurrency=1 src/tests/timesheet.test.js src/tests/timesheet-features.test.js src/tests/timesheet-employee-settings.test.js src/tests/timesheet-import.test.js src/tests/notification-delivery.test.js`.

Адрес API для новых браузерных сценариев задаётся через `TEST_API_BASE_URL`; по умолчанию — `http://localhost:5000/api`. Адрес API фронтенда должен совпадать с ним.
