-- Создание БД
CREATE DATABASE IF NOT EXISTS worker_cabinet;

\c worker_cabinet;

-- Типы отпусков (справочник)
CREATE TYPE vacation_type_enum AS ENUM (
  'annual_paid',
  'unpaid',
  'educational',
  'maternity',
  'child_care',
  'additional',
  'veteran'
);

-- Статусы заявок (справочник)
CREATE TYPE request_status_enum AS ENUM (
  'on_approval',
  'approved',
  'rejected',
  'cancelled_by_employee',
  'cancelled_by_manager'
);

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
  available_days INTEGER GENERATED ALWAYS AS (total_days - used_days) STORED,
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
  
  -- Тип и статус
  vacation_type vacation_type_enum DEFAULT 'annual_paid',
  status request_status_enum DEFAULT 'on_approval',
  
  -- Дополнительно
  comment TEXT,
  rejection_reason TEXT,
  cancellation_reason TEXT,
  has_travel BOOLEAN DEFAULT false,
  
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
  status request_status_enum NOT NULL,
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
CREATE INDEX idx_vacation_requests_status ON vacation_requests(status);
CREATE INDEX idx_vacation_requests_dates ON vacation_requests(start_date, end_date);
CREATE INDEX idx_vacation_requests_department ON vacation_requests(user_id);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_manager ON users(manager_id);

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
