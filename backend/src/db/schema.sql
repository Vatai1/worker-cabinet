-- Создание БД
CREATE DATABASE IF NOT EXISTS worker_cabinet;

\c worker_cabinet;

-- Роли пользователей
CREATE TYPE user_role_enum AS ENUM (
  'employee',
  'manager',
  'hr',
  'admin'
);

-- Статусы пользователей
CREATE TYPE user_status_enum AS ENUM (
  'active',
  'inactive',
  'on_leave'
);

-- Справочник статусов заявок
CREATE TABLE request_statuses (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Справочник типов отпусков
CREATE TABLE vacation_types (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица подразделений
CREATE TABLE departments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  manager_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица пользователей
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  position VARCHAR(255) NOT NULL,
  department_id INTEGER REFERENCES departments(id),
  phone VARCHAR(20),
  birth_date DATE,
  hire_date DATE NOT NULL,
  status user_status_enum DEFAULT 'active',
  role user_role_enum DEFAULT 'employee',
  manager_id INTEGER REFERENCES users(id),
  avatar VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Баланс отпускных дней
CREATE TABLE vacation_balances (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_days INTEGER DEFAULT 28 NOT NULL,
  used_days INTEGER DEFAULT 0 NOT NULL,
  available_days INTEGER DEFAULT 28 NOT NULL,
  reserved_days INTEGER DEFAULT 0 NOT NULL,
  last_accrual_date DATE,
  
  -- Проезд к месту проведения отпуска
  travel_available BOOLEAN DEFAULT false,
  travel_last_used_date DATE,
  travel_next_available_date DATE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Заявки на отпуск
CREATE TABLE vacation_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Период отпуска
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration INTEGER NOT NULL,

  -- Тип и статус (ссылки на справочники)
  vacation_type_id INTEGER NOT NULL REFERENCES vacation_types(id),
  status_id INTEGER NOT NULL REFERENCES request_statuses(id),

  -- Дополнительно
  comment TEXT,
  rejection_reason TEXT,
  cancellation_reason TEXT,
  has_travel BOOLEAN DEFAULT false,
  travel_destination VARCHAR(500),
  reference_document VARCHAR(500),

  -- Согласование
  reviewed_at TIMESTAMP,
  reviewed_by INTEGER REFERENCES users(id),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- История изменений статусов заявок
CREATE TABLE vacation_request_status_history (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES vacation_requests(id) ON DELETE CASCADE,
  status_id INTEGER NOT NULL REFERENCES request_statuses(id),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  changed_by INTEGER NOT NULL REFERENCES users(id),
  comment TEXT
);

-- Ограничения на пересечение отпусков
CREATE TABLE vacation_restrictions (
  id SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  
  -- Тип ограничения
  restriction_type VARCHAR(20) NOT NULL CHECK (restriction_type IN ('pair', 'group')),
  
  -- Сотрудники
  employee_ids INTEGER[] NOT NULL,
  
  -- Для групповых ограничений
  max_concurrent INTEGER,
  
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER NOT NULL REFERENCES users(id)
);

-- Индексы для оптимизации
CREATE INDEX idx_vacation_requests_user_id ON vacation_requests(user_id);
CREATE INDEX idx_vacation_requests_status_id ON vacation_requests(status_id);
CREATE INDEX idx_vacation_requests_vacation_type_id ON vacation_requests(vacation_type_id);
CREATE INDEX idx_vacation_requests_dates ON vacation_requests(start_date, end_date);
CREATE INDEX idx_vacation_requests_department ON vacation_requests(user_id);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_manager ON users(manager_id);

-- Индексы для справочников
CREATE INDEX idx_request_statuses_code ON request_statuses(code);
CREATE INDEX idx_vacation_types_code ON vacation_types(code);
CREATE INDEX idx_request_statuses_active ON request_statuses(is_active) WHERE is_active = true;
CREATE INDEX idx_vacation_types_active ON vacation_types(is_active) WHERE is_active = true;

-- Триггер для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vacation_balances_updated_at BEFORE UPDATE ON vacation_balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vacation_requests_updated_at BEFORE UPDATE ON vacation_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_request_statuses_updated_at BEFORE UPDATE ON request_statuses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vacation_types_updated_at BEFORE UPDATE ON vacation_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update available_days balance
CREATE OR REPLACE FUNCTION update_available_days()
RETURNS TRIGGER AS $$
BEGIN
  NEW.available_days := NEW.total_days - NEW.used_days - NEW.reserved_days;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_balance_available_days
  BEFORE INSERT OR UPDATE ON vacation_balances
  FOR EACH ROW EXECUTE FUNCTION update_available_days();

-- Начальные данные для справочников

-- Статусы заявок
INSERT INTO request_statuses (code, name, description, sort_order) VALUES
  ('on_approval', 'На согласовании', 'Заявка ожидает согласования менеджером', 1),
  ('approved', 'Одобрено', 'Заявка одобрена менеджером', 2),
  ('rejected', 'Отклонено', 'Заявка отклонена менеджером', 3),
  ('cancelled_by_employee', 'Отменено сотрудником', 'Заявка отменена сотрудником', 4),
  ('cancelled_by_manager', 'Отменено менеджером', 'Заявка отменена менеджером', 5)
ON CONFLICT (code) DO NOTHING;

-- Типы отпусков
INSERT INTO vacation_types (code, name, description, sort_order) VALUES
  ('annual_paid', 'Ежегодный оплачиваемый', 'Основной оплачиваемый отпуск', 1),
  ('unpaid', 'Неоплачиваемый', 'Отпуск без сохранения заработной платы', 2),
  ('educational', 'Учебный', 'Отпуск для обучения с сохранением заработной платы', 3),
  ('maternity', 'Отпуск по беременности и родам', 'Отпуск по беременности и родам', 4),
  ('child_care', 'Отпуск по уходу за ребенком', 'Отпуск по уходу за ребенком до достижения им возраста трех лет', 5),
  ('additional', 'Дополнительный', 'Дополнительный оплачиваемый отпуск', 6),
  ('veteran', 'Отпуск ветерана боевых действий', 'Отпуск для участников боевых действий', 7)
ON CONFLICT (code) DO NOTHING;

-- Задание значений по умолчанию для vacation_requests
ALTER TABLE vacation_requests ALTER COLUMN status_id SET DEFAULT (SELECT id FROM request_statuses WHERE code = 'on_approval');
ALTER TABLE vacation_requests ALTER COLUMN vacation_type_id SET DEFAULT (SELECT id FROM vacation_types WHERE code = 'annual_paid');
