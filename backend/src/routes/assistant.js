import { Router } from 'express'
import { authenticateToken } from '../middleware/auth.js'
import { query, getClient } from '../config/database.js'

const router = Router()

async function getAssistantConfig() {
  const result = await query(
    `SELECT key, value FROM system_settings WHERE key IN ('assistant_api_url', 'assistant_api_key', 'assistant_model', 'assistant_system_prompt')`
  )
  const map = Object.fromEntries(result.rows.map(r => [r.key, r.value]))
  return {
    apiUrl: map.assistant_api_url || '',
    apiKey: map.assistant_api_key || '',
    model: map.assistant_model || 'gpt-4o-mini',
    systemPrompt: map.assistant_system_prompt || 'Ты — кадровый ассистент. Помогай сотрудникам с вопросами о кадрах, отпусках, документах. Отвечай на русском языке.',
  }
}

/**
 * @swagger
 * /assistant/chat:
 *   post:
 *     tags: [Assistant]
 *     summary: Отправить сообщение ассистенту
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string }
 *               history: { type: array, items: { type: object, properties: { role: { type: string }, content: { type: string } } } }
 *     responses:
 *       200:
 *         description: Ответ ассистента
 */
router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const { message, history = [] } = req.body
    const userId = req.user.id

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' })
    }

    const config = await getAssistantConfig()

    if (!config.apiUrl || !config.apiKey) {
      return res.status(503).json({ error: 'Ассистент не настроен. Обратитесь к администратору.' })
    }

    const userResult = await query(
      'SELECT first_name, last_name, position, department_id FROM users WHERE id = $1',
      [userId]
    )
    const u = userResult.rows[0]

    const systemMessage = {
      role: 'system',
      content: `${config.systemPrompt}\n\nИмя пользователя: ${u?.first_name || ''} ${u?.last_name || ''}\nДолжность: ${u?.position || 'не указана'}`,
    }

    const messages = [
      systemMessage,
      ...history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ]

    const aiResponse = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: 2048,
        temperature: 0.7,
      }),
    })

    if (!aiResponse.ok) {
      const errText = await aiResponse.text().catch(() => '')
      console.error('AI API error:', aiResponse.status, errText)
      return res.status(502).json({ error: 'Ошибка связи с AI-сервисом' })
    }

    const aiData = await aiResponse.json()
    const responseText = aiData.choices?.[0]?.message?.content || 'Не удалось получить ответ'

    const client = await getClient()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO assistant_messages (user_id, role, content) VALUES ($1, 'user', $2)`,
        [userId, message]
      )
      await client.query(
        `INSERT INTO assistant_messages (user_id, role, content) VALUES ($1, 'assistant', $2)`,
        [userId, responseText]
      )
      await client.query('COMMIT')
    } catch {
      await client.query('ROLLBACK')
    } finally {
      client.release()
    }

    res.json({ response: responseText })
  } catch (error) {
    console.error('Assistant chat error:', error)
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

/**
 * @swagger
 * /assistant/history:
 *   get:
 *     tags: [Assistant]
 *     summary: Получить историю сообщений
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список сообщений
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT role, content, created_at FROM assistant_messages
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    )
    res.json(result.rows.reverse())
  } catch (error) {
    res.status(500).json({ error: 'Ошибка загрузки истории' })
  }
})

/**
 * @swagger
 * /assistant/history:
 *   delete:
 *     tags: [Assistant]
 *     summary: Очистить историю сообщений
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: История очищена
 */
router.delete('/history', authenticateToken, async (req, res) => {
  try {
    await query('DELETE FROM assistant_messages WHERE user_id = $1', [req.user.id])
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Ошибка очистки истории' })
  }
})

export default router
