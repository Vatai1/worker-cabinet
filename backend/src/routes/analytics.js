import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'

const router = express.Router()

// Helper function to get status ID by code
async function getStatusIdByCode(code) {
  const result = await query('SELECT id FROM request_statuses WHERE code = $1', [code])
  return result.rows[0]?.id
}

// Get vacation trends with monthly/quarterly/yearly aggregation
// Access: HR and admin only
router.get('/trends', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { period = 'monthly', year = new Date().getFullYear() } = req.query
    const approvedStatusId = await getStatusIdByCode('approved')

    let sql = ''
    const params = [approvedStatusId, year]

    if (period === 'monthly') {
      // Monthly aggregation: vacation days per month
      sql = `
        SELECT
          EXTRACT(MONTH FROM vr.start_date) as month,
          EXTRACT(YEAR FROM vr.start_date) as year,
          COUNT(vr.id) as request_count,
          SUM(vr.duration) as total_days,
          COUNT(DISTINCT vr.user_id) as unique_employees
        FROM vacation_requests vr
        WHERE vr.status_id = $1
        AND EXTRACT(YEAR FROM vr.start_date) = $2
        GROUP BY EXTRACT(YEAR FROM vr.start_date), EXTRACT(MONTH FROM vr.start_date)
        ORDER BY year, month
      `
    } else if (period === 'quarterly') {
      // Quarterly aggregation: vacation days per quarter
      sql = `
        SELECT
          EXTRACT(QUARTER FROM vr.start_date) as quarter,
          EXTRACT(YEAR FROM vr.start_date) as year,
          COUNT(vr.id) as request_count,
          SUM(vr.duration) as total_days,
          COUNT(DISTINCT vr.user_id) as unique_employees
        FROM vacation_requests vr
        WHERE vr.status_id = $1
        AND EXTRACT(YEAR FROM vr.start_date) = $2
        GROUP BY EXTRACT(YEAR FROM vr.start_date), EXTRACT(QUARTER FROM vr.start_date)
        ORDER BY year, quarter
      `
    } else if (period === 'yearly') {
      // Yearly aggregation: vacation days per year (last 5 years)
      sql = `
        SELECT
          EXTRACT(YEAR FROM vr.start_date) as year,
          COUNT(vr.id) as request_count,
          SUM(vr.duration) as total_days,
          COUNT(DISTINCT vr.user_id) as unique_employees
        FROM vacation_requests vr
        WHERE vr.status_id = $1
        AND EXTRACT(YEAR FROM vr.start_date) >= $2 - 4
        GROUP BY EXTRACT(YEAR FROM vr.start_date)
        ORDER BY year
      `
    } else {
      return res.status(400).json({ error: 'Invalid period. Use "monthly", "quarterly", or "yearly"' })
    }

    const result = await query(sql, params)

    // Format the response based on period type
    const trends = result.rows.map((row) => {
      if (period === 'monthly') {
        return {
          period: 'monthly',
          year: parseInt(row.year),
          month: parseInt(row.month),
          label: `${row.year}-${String(row.month).padStart(2, '0')}`,
          requestCount: parseInt(row.request_count),
          totalDays: parseInt(row.total_days) || 0,
          uniqueEmployees: parseInt(row.unique_employees)
        }
      } else if (period === 'quarterly') {
        return {
          period: 'quarterly',
          year: parseInt(row.year),
          quarter: parseInt(row.quarter),
          label: `Q${row.quarter} ${row.year}`,
          requestCount: parseInt(row.request_count),
          totalDays: parseInt(row.total_days) || 0,
          uniqueEmployees: parseInt(row.unique_employees)
        }
      } else {
        return {
          period: 'yearly',
          year: parseInt(row.year),
          label: String(row.year),
          requestCount: parseInt(row.request_count),
          totalDays: parseInt(row.total_days) || 0,
          uniqueEmployees: parseInt(row.unique_employees)
        }
      }
    })

    res.json({
      period,
      year: parseInt(year),
      data: trends
    })
  } catch (error) {
    console.error('Error fetching vacation trends:', error)
    res.status(500).json({ error: 'Failed to fetch vacation trends' })
  }
})

// Get department utilization statistics
// Access: HR and admin only
router.get('/utilization', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query
    const approvedStatusId = await getStatusIdByCode('approved')

    // Standard vacation days per employee per year
    const standardDaysPerYear = 28

    // Get employee count and vacation days used per department
    const sql = `
      SELECT
        d.id as department_id,
        d.name as department_name,
        COUNT(DISTINCT u.id) as employee_count,
        COALESCE(SUM(vr.duration), 0) as total_days_used
      FROM departments d
      LEFT JOIN users u ON u.department_id = d.id
      LEFT JOIN vacation_requests vr ON vr.user_id = u.id
        AND vr.status_id = $1
        AND EXTRACT(YEAR FROM vr.start_date) = $2
      GROUP BY d.id, d.name
      ORDER BY d.name
    `

    const result = await query(sql, [approvedStatusId, year])

    // Calculate utilization percentage for each department
    const utilization = result.rows.map((row) => {
      const employeeCount = parseInt(row.employee_count)
      const totalDaysUsed = parseInt(row.total_days_used) || 0
      const totalAvailableDays = employeeCount * standardDaysPerYear
      const utilizationPercentage = totalAvailableDays > 0
        ? Math.round((totalDaysUsed / totalAvailableDays) * 100 * 10) / 10
        : 0

      return {
        departmentId: row.department_id,
        departmentName: row.department_name,
        employeeCount,
        totalDaysUsed,
        totalAvailableDays,
        utilizationPercentage
      }
    })

    res.json({
      year: parseInt(year),
      standardDaysPerYear,
      data: utilization
    })
  } catch (error) {
    console.error('Error fetching department utilization:', error)
    res.status(500).json({ error: 'Failed to fetch department utilization' })
  }
})

export default router
