import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'))

const router = express.Router()

/**
 * @swagger
 * /version:
 *   get:
 *     summary: Версия API
 *     description: 'Возвращает текущую версию бэкенда из package.json'
 *     tags: [Version]
 *     responses:
 *       200:
 *         description: Версия API
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 api:
 *                   type: string
 *                   description: 'Версия бэкенда (semver)'
 *                   example: '1.0.5'
 */
router.get('/', (req, res) => {
  res.json({ api: pkg.version })
})

export default router
