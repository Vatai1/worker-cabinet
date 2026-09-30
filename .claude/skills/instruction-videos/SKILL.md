---
name: instruction-videos
description: Записать, собрать и загрузить видеоинструкцию для раздела «Инструкции» Worker Cabinet — ролик по приложению с курсором и субтитрами, фирменным титулом ЦРЦТ и финальной заставкой. Use when the user asks for a video instruction / видеоинструкцию / ролик / обучающее видео for a feature, or to re-record an existing one after UI changes.
---

# Видеоинструкции Worker Cabinet

Ролик = фирменный титул (4 с) → запись экрана 1440×900 с красным курсором, кругами на кликах и субтитрами → заставка с логотипом (3,5 с). MP4 H.264 + обложка JPG. Загружается в `instruction_videos` и показывается в окне «Как это работает» по `placement`.

## Требования

- macOS (титулы рисует `swift` + AppKit), `ffmpeg`/`ffprobe`, `python3`.
- Запущены фронт `:3000` и бэкенд `:5000` (`npm run dev`), в базе сид-пользователи (`ivanov@` — сотрудник, `petrov@` — руководитель отдела Иванова, `elena@` — HR, `superadmin@`; пароль `password123`).
- Playwright берётся из `node_modules` репозитория.

## Файлы

| Файл | Что делает |
|---|---|
| `lib.mjs` | `startRecording(key, email)` — логин через API (в кадр не попадает), запись в `.out/raw/<key>/`. Возвращает `page, pause, caption(title, sub?, 'top'?), hideCaption, moveTo, clickOn, typeInto, reveal(locator, block?), smoothScrollTo, dayCell(month, day), open(path), finish()` |
| `scenarios/*.mjs` | Сценарии роликов (см. таблицу ниже) — образцы стиля |
| `build.sh <key> "<label>" "<title>" <out-name>` | Титул + обложка (`brand/title_slate.swift`) и склейка → `.out/<out-name>.mp4` и `.jpg` |
| `upload.mjs --placement … --audience all\|manager --title … --description … --video … --poster … [--sort N]` | Загрузка под суперадмином; ролик с тем же `placement` заменяется (PUT), иначе создаётся |
| `brand/` | `logo_full.png`, `slate.png` (финальная заставка), шрифты Azoft Sans, `title_slate.swift`, `slate.swift` (пересобрать заставку: `swift slate.swift logo_full.png fonts/azoft-sans.ttf slate.png "Личный кабинет работника"`) |

Переменные окружения: `VIDEO_BASE_URL` (по умолчанию `http://localhost:3000`), `VIDEO_OUT_DIR` (`.out`), `VIDEO_API_URL` (`http://localhost:5000/api`), `VIDEO_ADMIN_EMAIL` / `VIDEO_ADMIN_PASSWORD`.

## Порядок работы

1. **Сценарий.** Скопируйте ближайший `scenarios/*.mjs`. Стиль:
   - первый субтитр — название и аудитория (`caption('Как взять отгул', 'Инструкция для сотрудника')`, пауза ~3,4 с);
   - шаги — `Шаг N. Действие`, вторая строка — пояснение «зачем/что увидите»;
   - перед кликом — `clickOn` (плавное движение курсора), ввод — `typeInto`; после действия ждите результат (`waitFor` тоста/заголовка), потом пауза 1,5–4 с, чтобы зритель успел прочитать;
   - финал — `Готово! …` с подсказкой, что дальше.
   Селекторы — роли, лейблы и `data-testid`, как в e2e.
2. **Демо-данные.** Сценарий должен начинаться с чистого состояния (например, у Иванова нет отгулов). Перед записью удалите то, что создал прошлый прогон, после — тоже.
3. **Запись:** `node .claude/skills/instruction-videos/scenarios/<key>.mjs` (или `cd` в папку скилла). Упало — поправьте селектор/ожидание и перезапустите: папка `raw/<key>` пересоздаётся.
4. **Проверка** без просмотра целиком — контактный лист кадров:
   `ffmpeg -v error -y -i .out/raw/<key>/*.webm -vf "fps=1/5,scale=480:-1,tile=4x3" -frames:v 1 .out/<key>-sheet.png`
   Смотрите: субтитры не перекрывают нужное, курсор указывает на объект, нет чужих модалок (интро раздела гасится cookie `vacation_intro_seen`).
5. **Сборка:** `./build.sh <key> "Инструкция для сотрудника" "Название" <N-slug>`.
6. **Загрузка:** `node upload.mjs --placement <placement> --audience all --title "…" --description "…" --video .out/<N-slug>.mp4 --poster .out/<N-slug>.jpg --sort N`.
7. Копия для пользователя — в `~/Downloads/instrukcii-otpusk/`.

## Новое место показа

`placement` — белый список: `backend/src/routes/instructions.js` (`PLACEMENTS` + swagger enum), `shared/components/InstructionVideos.tsx` (`InstructionPlacement`, `INSTRUCTION_PLACEMENTS`), и вывод `videoFor('<placement>')` в нужном окне (например `modules/vacation/components/VacationIntroModal.tsx`).

## Ролики

| key / сценарий | out-name | label | title | placement | audience | sort |
|---|---|---|---|---|---|---|
| vacation-create | 1-sotrudnik-zayavka-na-otpusk | Инструкция для сотрудника | Заявка на отпуск и скачивание заявления | vacation-create | all | 1 |
| vacation-transfer | 2-sotrudnik-perenos-otpuska | Инструкция для сотрудника | Перенос отпуска и скачивание заявления | vacation-transfer | all | 2 |
| vacation-approve | 3-rukovoditel-soglasovanie | Инструкция для руководителя | Согласование отпусков | vacation-approve | manager | 3 |
| vacation-restrictions | 4-rukovoditel-peresecheniya | Инструкция для руководителя | Пересечения отпусков | vacation-restrictions | manager | 4 |
| day-off-take | 5-sotrudnik-otgul | Инструкция для сотрудника | Как взять отгул | day-off-take | all | 5 |
| day-off-grant | 6-rukovoditel-nachislenie-otgulov | Инструкция для руководителя | Начисление отгулов | day-off-grant | manager | 6 |

Сценарии 1–4 писались под данные своего времени (например, `vacation-transfer` выбирает заявку по id `331`) — перед перезаписью сверьте даты и id с текущей базой. `day-off-grant` → `day-off-take` записываются подряд: первый начисляет Иванову отгул «За работу в выходной 27.09», второй его берёт (дата — `DAY_OFF_DATE`, по умолчанию `2026-10-09`).
