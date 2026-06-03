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
 * /assistant/sessions:
 *   get:
 *     tags: [Assistant]
 *     summary: Получить список сессий
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список сессий
 */
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT s.id, s.title, s.created_at AS "createdAt",
        (SELECT COUNT(*) FROM assistant_messages WHERE session_id = s.id) AS message_count
       FROM assistant_sessions s
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC`,
      [req.user.id]
    )
    res.json(result.rows)
  } catch (error) {
    res.status(500).json({ error: 'Ошибка загрузки сессий' })
  }
})

/**
 * @swagger
 * /assistant/sessions/{id}:
 *   get:
 *     tags: [Assistant]
 *     summary: Получить сессию с сообщениями
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Сессия с сообщениями
 */
router.get('/sessions/:id', authenticateToken, async (req, res) => {
  try {
    const session = await query(
      `SELECT id, title, created_at AS "createdAt" FROM assistant_sessions WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    )
    if (session.rows.length === 0) {
      return res.status(404).json({ error: 'Сессия не найдена' })
    }
    const messages = await query(
      `SELECT id, role, content, created_at AS "timestamp" FROM assistant_messages
       WHERE session_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    )
    res.json({ ...session.rows[0], messages: messages.rows })
  } catch (error) {
    res.status(500).json({ error: 'Ошибка загрузки чата' })
  }
})

/**
 * @swagger
 * /assistant/sessions/{id}:
 *   delete:
 *     tags: [Assistant]
 *     summary: Удалить сессию
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Сессия удалена
 */
router.delete('/sessions/:id', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM assistant_sessions WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    )
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Сессия не найдена' })
    }
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Ошибка удаления сессии' })
  }
})

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
 *             required: [message, sessionId]
 *             properties:
 *               message: { type: string }
 *               sessionId: { type: string }
 *               history: { type: array, items: { type: object, properties: { role: { type: string }, content: { type: string } } } }
 *     responses:
 *       200:
 *         description: Ответ ассистента
 */
router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const { message, sessionId, history = [] } = req.body
    const userId = req.user.id

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' })
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'Не указана сессия' })
    }

    const config = await getAssistantConfig()

    if (!config.apiUrl || !config.apiKey) {
      return res.status(503).json({ error: 'Ассистент не настроен. Обратитесь к администратору.' })
    }

    const sessionCheck = await query(
      `SELECT id FROM assistant_sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    )

    const client = await getClient()
    try {
      await client.query('BEGIN')

      if (sessionCheck.rows.length === 0) {
        const title = message.slice(0, 40) + (message.length > 40 ? '...' : '')
        await client.query(
          `INSERT INTO assistant_sessions (id, user_id, title) VALUES ($1, $2, $3)`,
          [sessionId, userId, title]
        )
      }

      await client.query(
        `INSERT INTO assistant_messages (session_id, user_id, role, content) VALUES ($1, $2, 'user', $3)`,
        [sessionId, userId, message]
      )

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    const userResult = await query(
      'SELECT first_name, last_name, position FROM users WHERE id = $1',
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
        stream: true,
      }),
    })

    if (!aiResponse.ok) {
      const errText = await aiResponse.text().catch(() => '')
      console.error('AI API error:', aiResponse.status, errText)
      return res.status(502).json({ error: 'Ошибка связи с AI-сервисом' })
    }

    const aiContentType = aiResponse.headers.get('content-type') || ''

    if (!aiContentType.includes('text/event-stream')) {
      const aiData = await aiResponse.json()
      const responseText = aiData.choices?.[0]?.message?.content || 'Не удалось получить ответ'

      await query(
        `INSERT INTO assistant_messages (session_id, user_id, role, content) VALUES ($1, $2, 'assistant', $3)`,
        [sessionId, userId, responseText]
      )

      return res.json({ response: responseText })
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    let fullResponse = ''
    const reader = aiResponse.body.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        res.write(chunk)

        const lines = chunk.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
          try {
            const data = JSON.parse(line.slice(6))
            const content = data.choices?.[0]?.delta?.content
            if (content) fullResponse += content
          } catch {}
        }
      }
    } catch (error) {
      console.error('Stream read error:', error.message)
    }

    res.write('data: [DONE]\n\n')

    if (fullResponse) {
      await query(
        `INSERT INTO assistant_messages (session_id, user_id, role, content) VALUES ($1, $2, 'assistant', $3)`,
        [sessionId, userId, fullResponse]
      )
    }

    const updatedSession = await query(
      `SELECT title FROM assistant_sessions WHERE id = $1`,
      [sessionId]
    )
    const currentTitle = updatedSession.rows[0]?.title

    if (currentTitle === 'Новый чат') {
      await query(
        `UPDATE assistant_sessions SET title = $1 WHERE id = $2 AND title = 'Новый чат'`,
        [message.slice(0, 40) + (message.length > 40 ? '...' : ''), sessionId]
      )
    }

    res.end()
  } catch (error) {
    console.error('Assistant error:', error.message)
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

/**
 * @swagger
 * /assistant/history:
 *   get:
 *     tags: [Assistant]
 *     summary: Получить всю историю сообщений
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
       WHERE user_id = $1 AND session_id IS NULL ORDER BY created_at DESC LIMIT 100`,
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
 *     summary: Очистить историю сообщений без сессий
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: История очищена
 */
router.delete('/history', authenticateToken, async (req, res) => {
  try {
    await query('DELETE FROM assistant_messages WHERE user_id = $1 AND session_id IS NULL', [req.user.id])
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Ошибка очистки истории' })
  }
})

export default router
