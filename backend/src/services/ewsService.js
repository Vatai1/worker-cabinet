import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const KEY = crypto.scryptSync(process.env.JWT_SECRET || 'fallback-secret-key', 'exchange-salt', 32)

export function encrypt(text) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGO, KEY, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag()
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted
}

export function decrypt(encryptedText) {
  const parts = encryptedText.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted data')
  const iv = Buffer.from(parts[0], 'hex')
  const tag = Buffer.from(parts[1], 'hex')
  const encrypted = parts[2]
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

function buildSoapEnvelope(body) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <t:RequestServerVersion Version="Exchange2016" />
  </soap:Header>
  <soap:Body>
    ${body}
  </soap:Body>
</soap:Envelope>`
}

function extractTag(xml, tagName, scope) {
  const source = scope || xml
  const re = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`)
  const m = source.match(re)
  return m ? m[1].trim() : ''
}

function extractAttr(xml, tagName, attr) {
  const re = new RegExp(`<${tagName}[^>]*${attr}="([^"]*)"`)
  const m = xml.match(re)
  return m ? m[1] : ''
}

function parseEwsEvents(xml) {
  const events = []
  const itemRegex = /<t:CalendarItem[^>]*>([\s\S]*?)<\/t:CalendarItem>/g
  let match

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1]
    const subject = extractTag(itemXml, 't:Subject')
    const itemId = extractAttr(itemXml, 't:ItemId', 'Id')
    const isAllDay = extractTag(itemXml, 't:IsAllDayEvent') === 'true'
    const startVal = extractTag(itemXml, 't:Start')
    const endVal = extractTag(itemXml, 't:End')
    const location = extractTag(itemXml, 't:Name', extractTag(itemXml, 't:Location'))
    const organizerEmail = extractAttr(itemXml, 't:Mailbox', 'EmailAddress')
    const organizerName = extractTag(itemXml, 't:Name', extractTag(itemXml, 't:Organizer'))
    const categoriesMatch = itemXml.match(/<t:Categories>([\s\S]*?)<\/t:Categories>/)
    const categories = categoriesMatch
      ? (categoriesMatch[1].match(/<t:String>([^<]*)<\/t:String>/g) || []).map(s => s.replace(/<\/?t:String>/g, ''))
      : []

    events.push({
      id: itemId || `ews-${events.length}`,
      subject: subject || '(Без темы)',
      start: { dateTime: startVal || '' },
      end: { dateTime: endVal || '' },
      isAllDay,
      location: location ? { displayName: location } : undefined,
      organizer: organizerName ? { emailAddress: { name: organizerName, address: organizerEmail } } : undefined,
      categories,
    })
  }

  return events
}

export async function fetchEwsEvents(ewsUrl, username, password, domain, startIso, endIso) {
  const soapBody = `
    <m:FindItem Traversal="Shallow">
      <m:ItemShape>
        <t:BaseShape>Default</t:BaseShape>
        <t:AdditionalProperties>
          <t:FieldURI FieldURI="item:Subject"/>
          <t:FieldURI FieldURI="calendar:Start"/>
          <t:FieldURI FieldURI="calendar:End"/>
          <t:FieldURI FieldURI="calendar:IsAllDayEvent"/>
          <t:FieldURI FieldURI="calendar:Location"/>
          <t:FieldURI FieldURI="calendar:Organizer"/>
          <t:FieldURI FieldURI="item:Categories"/>
        </t:AdditionalProperties>
      </m:ItemShape>
      <m:CalendarView StartDate="${startIso}" EndDate="${endIso}" MaxEntriesReturned="200"/>
      <m:ParentFolderIds>
        <t:DistinguishedFolderId Id="calendar"/>
      </m:ParentFolderIds>
    </m:FindItem>
  `

  const envelope = buildSoapEnvelope(soapBody)

  let user = username
  if (domain && !username.includes('\\') && !username.includes('@')) {
    user = domain + '\\' + username
  }

  const token = Buffer.from(user + ':' + password).toString('base64')

  console.log('[EWS] Connecting to:', ewsUrl)
  console.log('[EWS] User:', user)

  const res = await fetch(ewsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Authorization': 'Basic ' + token,
      'User-Agent': 'WorkerCabinet/1.0',
      'Accept': 'text/xml',
    },
    body: envelope,
  })

  if (!res.ok) {
    const text = await res.text()
    const authHeaders = res.headers.get('www-authenticate') || ''
    console.error('[EWS] HTTP', res.status, 'Auth headers:', authHeaders, 'Body:', text.substring(0, 300))
    if (res.status === 401) {
      throw new Error('Неверный логин или пароль. Проверьте учётные данные.' + (authHeaders ? ' Поддерживаемые методы: ' + authHeaders : ''))
    }
    throw new Error('EWS HTTP ' + res.status + ': ' + text.substring(0, 200))
  }

  const responseXml = await res.text()

  const faultMatch = responseXml.match(/<faultstring>([^<]*)<\/faultstring>/)
  if (faultMatch) {
    throw new Error(`EWS: ${faultMatch[1]}`)
  }

  return parseEwsEvents(responseXml)
}

export async function testEwsConnection(ewsUrl, username, password, domain) {
  try {
    const now = new Date()
    const end = new Date(now)
    end.setDate(end.getDate() + 1)
    await fetchEwsEvents(ewsUrl, username, password, domain, now.toISOString(), end.toISOString())
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
