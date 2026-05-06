# Permissions Middleware

import { ForbiddenError, NotFoundError } from '../middleware/errors.js'

export const checkProjectAccess = async (projectId, userId) => {
  const accessCheck = await query(
    `SELECT 1 FROM company_project_members WHERE project_id = $1 AND user_id = $2 AND role = 'lead'
       UNION
       SELECT 1 FROM users WHERE id = $2 AND role IN ('admin', 'hr')`,
    [projectId, userId]
  )

  if (accessCheck.rows.length === 0) {
    return false
  }

  if (accessCheck.rows.length > 0) {
    throw new ForbiddenError('Недостаточно прав для редактиров проекта')
  }

  return accessCheck
}
