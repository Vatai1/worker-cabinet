const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
}

const LOG_LEVEL = process.env.LOG_LEVEL || 'DEBUG'
const currentLevel = LOG_LEVELS[LOG_LEVEL] ?? LOG_LEVELS.DEBUG

const COLORS = {
  DEBUG: '\x1b[36m',
  INFO: '\x1b[32m',
  WARN: '\x1b[33m',
  ERROR: '\x1b[31m',
  RESET: '\x1b[0m',
  DIM: '\x1b[2m',
  BRIGHT: '\x1b[1m',
}

const formatTimestamp = () => {
  const now = new Date()
  return now.toISOString().replace('T', ' ').substring(0, 19)
}

const getClientIP = (req) => {
  return req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
         req?.headers?.['x-real-ip'] ||
         req?.connection?.remoteAddress ||
         req?.socket?.remoteAddress ||
         req?.ip ||
         'unknown'
}

const formatMessage = (level, module, action, data, ip = null) => {
  const timestamp = formatTimestamp()
  const color = COLORS[level] || COLORS.INFO
  const ipStr = ip ? ` [${ip}]` : ''
  const prefix = `${COLORS.DIM}${timestamp}${COLORS.RESET} ${color}${level.padEnd(5)}${COLORS.RESET} ${COLORS.BRIGHT}[${module}]${COLORS.RESET}${ipStr}`
  
  if (data === undefined || data === '') {
    return `${prefix} ${action}`
  }
  
  if (typeof data === 'object') {
    try {
      const jsonStr = JSON.stringify(data, null, 2)
        .split('\n')
        .map((line, i) => i === 0 ? line : '  ' + line)
        .join('\n')
      return `${prefix} ${action}\n${jsonStr}`
    } catch {
      return `${prefix} ${action} [Circular]`
    }
  }
  return `${prefix} ${action} ${data}`
}

const log = {
  debug: (module, action, data = '') => {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.log(formatMessage('DEBUG', module, action, data))
    }
  },

  info: (module, action, data = '') => {
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.log(formatMessage('INFO', module, action, data))
    }
  },

  warn: (module, action, data = '') => {
    if (currentLevel <= LOG_LEVELS.WARN) {
      console.warn(formatMessage('WARN', module, action, data))
    }
  },

  error: (module, action, data = '') => {
    if (currentLevel <= LOG_LEVELS.ERROR) {
      console.error(formatMessage('ERROR', module, action, data))
    }
  },

  request: (req, module, action) => {
    const ip = getClientIP(req)
    const data = {
      method: req.method,
      url: req.originalUrl,
      userId: req.user?.id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      body: req.body,
      query: req.query,
      params: req.params,
    }
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.log(formatMessage('INFO', module, action, data, ip))
    }
  },

  response: (module, action, statusCode, data, req = null) => {
    const ip = req ? getClientIP(req) : null
    const statusColor = statusCode >= 400 ? COLORS.ERROR : COLORS.INFO
    const statusStr = `${statusColor}${statusCode}${COLORS.RESET}`
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.log(formatMessage('INFO', module, `${action} [${statusStr}]`, data, ip))
    }
  },

  db: (module, action, query, params, req = null) => {
    const ip = req ? getClientIP(req) : null
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.log(formatMessage('DEBUG', module, action, { 
        query: query?.substring(0, 300), 
        params: params?.length > 10 ? params.slice(0, 10).concat(['...']) : params 
      }, ip))
    }
  },

  transaction: (module, action, data, req = null) => {
    const ip = req ? getClientIP(req) : null
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.log(formatMessage('INFO', module, `TX: ${action}`, data, ip))
    }
  },

  api: {
    start: (req, module, action) => {
      log.request(req, module, `>>> ${action}`)
    },
    success: (req, module, action, statusCode, data) => {
      log.response(module, `<<< ${action}`, statusCode, data, req)
    },
    error: (req, module, action, error, statusCode = 500) => {
      const ip = getClientIP(req)
      const errorData = {
        error: error?.message || error,
        stack: error?.stack?.split('\n').slice(0, 3),
        body: req?.body,
      }
      if (currentLevel <= LOG_LEVELS.ERROR) {
        console.error(formatMessage('ERROR', module, `<<< ${action} [${statusCode}]`, errorData, ip))
      }
    },
  },

  vacation: {
    create: (req, data) => log.request(req, 'VACATION', 'CREATE REQUEST', data),
    approve: (req, requestId) => log.request(req, 'VACATION', `APPROVE REQUEST #${requestId}`),
    reject: (req, requestId, reason) => log.request(req, 'VACATION', `REJECT REQUEST #${requestId}`, { reason }),
    cancel: (req, requestId) => log.request(req, 'VACATION', `CANCEL REQUEST #${requestId}`),
    balance: (req, userId) => log.request(req, 'VACATION', `GET BALANCE for user #${userId}`),
    restrictions: (req, departmentId) => log.request(req, 'VACATION', `CHECK RESTRICTIONS for dept #${departmentId}`),
  },
}

export default log
