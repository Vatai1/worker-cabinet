import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool, types } = pg

types.setTypeParser(1082, (val) => val)

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message || err)
})

export const query = (text, params) => pool.query(text, params)
export const getClient = () => pool.connect()
