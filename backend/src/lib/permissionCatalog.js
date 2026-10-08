export const FULL_ACCESS_ROLES = ['superadmin', 'admin']

const MANAGERS = ['manager', 'director']
const STAFF = ['employee', ...MANAGERS, 'hr']

export const PERMISSIONS = [
  { code: 'users:view', module: 'users', name: 'Просмотр списка сотрудников', defaults: STAFF },
  { code: 'users:edit', module: 'users', name: 'Массовые изменения сотрудников: статус, должность, отдел, основное учреждение', defaults: ['hr'] },
  { code: 'users:manage_roles', module: 'users', name: 'Изменение системных ролей сотрудников', defaults: ['hr'] },

  { code: 'hr:access', module: 'hr', name: 'Доступ к HR-панели', defaults: ['hr'] },

  { code: 'vacation:manage', module: 'vacation', name: 'Настройки отпусков: балансы, нормы дней, блокировка подачи заявлений', defaults: ['hr'] },
  { code: 'vacation:reports', module: 'vacation', name: 'Отчёты по отпускам', defaults: ['hr'] },
  { code: 'staff:reports', module: 'users', name: 'Отчёты по персоналу', defaults: ['hr'] },
  { code: 'vacation:restrictions', module: 'vacation', name: 'Правила пересечений отпусков', defaults: [...MANAGERS, 'hr'] },

  { code: 'day_off:take', module: 'day_offs', name: 'Оформление отгулов', defaults: STAFF },
  { code: 'day_off:grant', module: 'day_offs', name: 'Начисление отгулов (руководитель — подчинённым, HR — всем)', defaults: [...MANAGERS, 'hr'] },

  { code: 'timesheet:view', module: 'timesheet', name: 'Ведение табеля своего отдела', defaults: [...MANAGERS, 'hr'] },
  { code: 'timesheet:manage', module: 'timesheet', name: 'Табели всех отделов: создание и согласование', defaults: ['hr'] },

  { code: 'surveys:manage', module: 'surveys', name: 'Создание опросов и просмотр результатов', defaults: ['hr'] },
  { code: 'mailing:manage', module: 'mailing', name: 'Рассылки сотрудникам', defaults: ['hr'] },
  { code: 'onboarding:manage', module: 'onboarding', name: 'Онбординг новых сотрудников и шаблоны документов онбординга', defaults: ['hr'] },
  { code: 'onboarding:pass', module: 'onboarding', name: 'Прохождение онбординга', defaults: ['onboarding'] },

  { code: 'hierarchy:manage', module: 'hierarchy', name: 'Редактирование иерархии организации', defaults: ['hr'] },
  { code: 'departments:manage', module: 'departments', name: 'Отделы: создание, изменение, состав и руководители', defaults: ['hr'] },
  { code: 'organization:members', module: 'departments', name: 'Участники учреждения и структура учреждений', defaults: ['hr'] },

  { code: 'dictionaries:manage', module: 'dictionaries', name: 'Справочники: теги, типы отпусков, должности', defaults: ['hr'] },
  { code: 'dictionaries:positions', module: 'dictionaries', name: 'Переименование и удаление должностей', defaults: [] },
  { code: 'documents:templates', module: 'documents', name: 'Шаблоны документов', defaults: ['hr'] },

  { code: 'admin:access', module: 'admin', name: 'Доступ к панели администратора', defaults: [] },
  { code: 'admin:roles', module: 'admin', name: 'Роли, права доступа и сопоставление ролей', defaults: [] },
  { code: 'admin:settings', module: 'admin', name: 'Системные настройки и модули учреждения', defaults: [] },
  { code: 'admin:audit', module: 'admin', name: 'Журнал аудита', defaults: [] },
  { code: 'admin:online', module: 'admin', name: 'Кто сейчас на сайте', defaults: [] },
  { code: 'admin:errors', module: 'admin', name: 'Журнал ошибок', defaults: [] },
  { code: 'bug_reports:manage', module: 'admin', name: 'Сообщения об ошибках: просмотр и ответы', defaults: [] },
]

export const PERMISSION_CODES = PERMISSIONS.map((p) => p.code)
