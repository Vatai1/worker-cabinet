const nullableDate = { type: 'string', format: 'date-time', nullable: true }

export const deploymentSchemas = {
  DeploymentSettings: {
    type: 'object', additionalProperties: false,
    required: ['enabled', 'frontend_url', 'backend_health_url', 'health_timeout_seconds'],
    properties: {
      enabled: { type: 'boolean' },
      frontend_url: { type: 'string', description: 'Адрес сайта HTTP(S) без пути; может быть пустым, если обновления отключены' },
      backend_health_url: { type: 'string', description: 'Адрес /api/health, доступный сервису деплоя' },
      health_timeout_seconds: { type: 'integer', minimum: 30, maximum: 600 },
    },
  },
  DeploymentRelease: {
    type: 'object', required: ['version', 'commit', 'frontend', 'backend'],
    properties: {
      version: { type: 'string' }, commit: { type: 'string' },
      frontend: { type: 'string', description: 'Образ frontend по digest sha256' },
      backend: { type: 'string', description: 'Образ API и воркера по digest sha256' },
    },
  },
  DeploymentJob: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      release: { $ref: '#/components/schemas/DeploymentRelease' },
      settings: { $ref: '#/components/schemas/DeploymentSettings' },
      initiated_by: { type: 'integer', nullable: true },
      status: { type: 'string', enum: ['queued', 'running', 'recovery_required', 'completed', 'failed'] },
      stage: { type: 'string' },
      events: { type: 'array', items: { type: 'object', properties: {
        stage: { type: 'string' }, status: { type: 'string', enum: ['running', 'completed', 'failed'] },
        message: { type: 'string' }, at: { type: 'string', format: 'date-time' },
      } } },
      before_state: { type: 'object', additionalProperties: true },
      after_state: { type: 'object', additionalProperties: true },
      backup: { type: 'string', nullable: true },
      resolution_requested: { type: 'boolean' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
      started_at: nullableDate, finished_at: nullableDate,
    },
  },
}
