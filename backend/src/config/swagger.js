import swaggerJsdoc from 'swagger-jsdoc'

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Worker Cabinet API',
      version: '1.0.0',
      description: 'Система управления персоналом (HR Management System). API для управления сотрудниками, отпусками, проектами, табелями, опросами и документами.',
    },
    servers: [
      { url: 'http://localhost:5000/api', description: 'Локальная разработка' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', description: 'Описание ошибки на русском языке' },
            code: { type: 'string', description: 'Код ошибки (VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT)' },
          },
          required: ['error'],
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            email: { type: 'string', format: 'email' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            middle_name: { type: 'string' },
            position: { type: 'string' },
            department: { type: 'string' },
            department_id: { type: 'integer' },
            phone: { type: 'string' },
            birth_date: { type: 'string', format: 'date' },
            hire_date: { type: 'string', format: 'date' },
            status: { type: 'string', enum: ['active', 'on_vacation', 'sick', 'remote', 'inactive'] },
            role: { type: 'string', enum: ['employee', 'manager', 'hr', 'admin', 'onboarding'] },
            manager_id: { type: 'integer' },
            avatar: { type: 'string', nullable: true },
            responsibility_area: { type: 'string', nullable: true },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'admin@example.com' },
            password: { type: 'string', format: 'password', example: 'password123' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: { $ref: '#/components/schemas/User' },
          },
        },
        VacationType: {
          type: 'string',
          enum: ['annual_paid', 'unpaid', 'educational', 'maternity', 'child_care', 'additional', 'veteran'],
        },
        VacationRequest: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            start_date: { type: 'string', format: 'date' },
            end_date: { type: 'string', format: 'date' },
            duration: { type: 'integer' },
            vacation_type: { $ref: '#/components/schemas/VacationType' },
            status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'cancelled'] },
            comment: { type: 'string' },
            has_travel: { type: 'boolean' },
            travel_destination: { type: 'string' },
            reference_document: { type: 'string' },
            rejection_reason: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        VacationBalance: {
          type: 'object',
          properties: {
            total_days: { type: 'number' },
            used_days: { type: 'number' },
            reserved_days: { type: 'number' },
            available_days: { type: 'number' },
            year: { type: 'integer' },
            user_id: { type: 'integer' },
          },
        },
        Project: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            full_name: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['active', 'completed', 'on_hold', 'planning'] },
            start_date: { type: 'string', format: 'date', nullable: true },
            end_date: { type: 'string', format: 'date', nullable: true },
            created_by: { type: 'integer' },
            created_at: { type: 'string', format: 'date-time' },
            member_count: { type: 'integer' },
          },
        },
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            userId: { type: 'integer' },
            title: { type: 'string' },
            message: { type: 'string' },
            type: { type: 'string', enum: ['info', 'success', 'warning', 'error'] },
            read: { type: 'boolean' },
            link: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Department: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            manager_id: { type: 'integer', nullable: true },
            description: { type: 'string', nullable: true },
            vacation_requests_blocked: { type: 'boolean' },
            manager_name: { type: 'string', nullable: true },
            employee_count: { type: 'integer' },
          },
        },
        Survey: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            title: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'active', 'closed'] },
            target_type: { type: 'string', enum: ['all', 'department', 'role', 'specific'] },
            deadline: { type: 'string', format: 'date', nullable: true },
            anonymous: { type: 'boolean' },
            question_count: { type: 'integer' },
            response_count: { type: 'integer' },
            total_targeted: { type: 'integer' },
          },
        },
        Timesheet: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            department_id: { type: 'integer' },
            year: { type: 'integer' },
            month: { type: 'integer' },
            status: { type: 'string', enum: ['draft', 'submitted', 'approved'] },
            created_by: { type: 'integer' },
            department_name: { type: 'string' },
          },
        },
        TimesheetEntry: {
          type: 'object',
          properties: {
            employee_id: { type: 'integer' },
            date: { type: 'string', format: 'date' },
            code: { type: 'string', description: 'Код Т-13 (Я, В, ОТ, Б, К, Н, ПР, РВ и т.д.)' },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            data: { type: 'array' },
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Аутентификация и авторизация' },
      { name: 'Users', description: 'Управление пользователями' },
      { name: 'Vacation', description: 'Управление отпусками' },
      { name: 'Projects', description: 'Управление проектами' },
      { name: 'Documents', description: 'Управление документами' },
      { name: 'Notifications', description: 'Уведомления' },
      { name: 'Departments', description: 'Отделы' },
      { name: 'Surveys', description: 'Опросы' },
      { name: 'Onboarding', description: 'Адаптация новых сотрудников' },
      { name: 'Hierarchy', description: 'Организационная структура' },
      { name: 'Dictionaries', description: 'Справочники' },
      { name: 'Timesheet', description: 'Табель учёта рабочего времени' },
      { name: 'Calendar', description: 'Интеграция с календарём (Outlook/EWS)' },
      { name: 'Telegram', description: 'Интеграция с Telegram' },
    ],
  },
  apis: ['./src/routes/*.js'],
}

export const swaggerSpec = swaggerJsdoc(options)
