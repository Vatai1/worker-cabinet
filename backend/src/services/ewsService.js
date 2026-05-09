import crypto from 'crypto'
import https from 'https'
import httpntlm from 'httpntlm'
import { URL } from 'url'

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
  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
    ' xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"' +
    ' xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"' +
    ' xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Header><t:RequestServerVersion Version="Exchange2016"/></soap:Header>' +
    '<soap:Body>' + body + '</soap:Body></soap:Envelope>'
}

function extractTag(xml, tagName, scope) {
  const source = scope || xml
  const re = new RegExp('<' + tagName + '[^>]*>([\\s\\S]*?)</' + tagName + '>')
  const m = source.match(re)
  return m ? m[1].trim() : ''
}

function extractAttr(xml, tagName, attr) {
  const re = new RegExp('<' + tagName + '[^>]*' + attr + '="([^"]*)"')
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
    const changeKey = extractAttr(itemXml, 't:ItemId', 'ChangeKey')
    const isAllDay = extractTag(itemXml, 't:IsAllDayEvent') === 'true'
    const startVal = extractTag(itemXml, 't:Start')
    const endVal = extractTag(itemXml, 't:End')
    const location = extractTag(itemXml, 't:Location')
    const organizerEmail = extractAttr(itemXml, 't:Mailbox', 'EmailAddress')
    const organizerName = extractTag(itemXml, 't:Name', extractTag(itemXml, 't:Organizer'))
    const categoriesMatch = itemXml.match(/<t:Categories>([\s\S]*?)<\/t:Categories>/)
    const categories = categoriesMatch
      ? (categoriesMatch[1].match(/<t:String>([^<]*)<\/t:String>/g) || []).map(s => s.replace(/<\/?t:String>/g, ''))
      : []

    const bodyMatch = itemXml.match(/<t:Body[^>]*>([\s\S]*?)<\/t:Body>/)
    let bodyContent = bodyMatch ? bodyMatch[1].trim() : ''
    const bodyType = bodyMatch ? (bodyMatch[0].match(/BodyType="([^"]*)"/)?.[1] || 'Text') : 'Text'
    if (bodyContent) {
      bodyContent = bodyContent.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    }

    const attendees = []
    const attendeeSection = itemXml.match(/<t:RequiredAttendees>([\s\S]*?)<\/t:RequiredAttendees>/)
    if (attendeeSection) {
      const mailboxes = attendeeSection[1].match(/<t:Attendee[\s\S]*?<\/t:Attendee>/g) || []
      for (const mb of mailboxes) {
        const name = extractTag(mb, 't:Name')
        const addr = extractAttr(mb, 't:Mailbox', 'EmailAddress')
        const resp = extractTag(mb, 't:ResponseType')
        if (name || addr) attendees.push({ emailAddress: { name, address: addr }, type: 'required', status: { response: resp || 'none' } })
      }
    }
    const optAttendeeSection = itemXml.match(/<t:OptionalAttendees>([\s\S]*?)<\/t:OptionalAttendees>/)
    if (optAttendeeSection) {
      const mailboxes = optAttendeeSection[1].match(/<t:Attendee[\s\S]*?<\/t:Attendee>/g) || []
      for (const mb of mailboxes) {
        const name = extractTag(mb, 't:Name')
        const addr = extractAttr(mb, 't:Mailbox', 'EmailAddress')
        const resp = extractTag(mb, 't:ResponseType')
        if (name || addr) attendees.push({ emailAddress: { name, address: addr }, type: 'optional', status: { response: resp || 'none' } })
      }
    }

    const sensitivity = extractTag(itemXml, 't:Sensitivity')
    const importance = extractTag(itemXml, 't:Importance')
    const createdDateTime = extractTag(itemXml, 't:DateTimeCreated')
    const lastModifiedDateTime = extractTag(itemXml, 't:LastModifiedTime')
    const isMeeting = extractTag(itemXml, 't:IsMeeting') === 'true'
    const appointmentType = extractTag(itemXml, 't:AppointmentType')
    const showAs = extractTag(itemXml, 't:LegacyFreeBusyStatus')
    const myResponseType = extractTag(itemXml, 't:MyResponseType')
    const duration = extractTag(itemXml, 't:Duration')
    const meetingRequestWasSent = extractTag(itemXml, 't:MeetingRequestWasSent') === 'true'
    const allowNewTimeProposal = extractTag(itemXml, 't:AllowNewTimeProposal') === 'true'
    const isResponseRequested = extractTag(itemXml, 't:IsResponseRequested') === 'true'
    const hasAttachments = extractTag(itemXml, 't:HasAttachments') === 'true'
    const iCalUId = extractTag(itemXml, 't:UID')

    const resources = []
    const resourcesSection = itemXml.match(/<t:Resources>([\s\S]*?)<\/t:Resources>/)
    if (resourcesSection) {
      const mailboxes = resourcesSection[1].match(/<t:Attendee[\s\S]*?<\/t:Attendee>/g) || []
      for (const mb of mailboxes) {
        const name = extractTag(mb, 't:Name')
        const addr = extractAttr(mb, 't:Mailbox', 'EmailAddress')
        if (name || addr) resources.push({ emailAddress: { name, address: addr }, type: 'resource' })
      }
    }

    const allAttendees = [...attendees, ...resources]

    const recurrenceMatch = itemXml.match(/<t:Recurrence>([\s\S]*?)<\/t:Recurrence>/)
    let recurrence = undefined
    if (recurrenceMatch) {
      const rxml = recurrenceMatch[1]
      const patternMatch = rxml.match(/<t:(Daily|Weekly|Monthly|Yearly)Recurrence[^>]*>([\s\S]*?)<\/t:(Daily|Weekly|Monthly|Yearly)Recurrence>/)
      const rangeMatch = rxml.match(/<t:NoEndRecurrence|<t:EndDateRecurrence|<t:NumberedRecurrence/)
      recurrence = {
        pattern: patternMatch ? { type: patternMatch[1] } : undefined,
        range: rangeMatch ? { type: rangeMatch[0].includes('NoEnd') ? 'noEnd' : rangeMatch[0].includes('EndDate') ? 'endDate' : 'numbered' } : undefined,
      }
    }

    events.push({
      id: itemId || 'ews-' + events.length,
      _changeKey: changeKey || undefined,
      subject: subject || '(Без темы)',
      start: { dateTime: startVal || '' },
      end: { dateTime: endVal || '' },
      isAllDay,
      location: location ? { displayName: location } : undefined,
      organizer: organizerName ? { emailAddress: { name: organizerName, address: organizerEmail } } : undefined,
      categories,
      body: bodyContent ? { content: bodyContent, contentType: bodyType } : undefined,
      attendees: allAttendees.length > 0 ? allAttendees : undefined,
      sensitivity: sensitivity || undefined,
      importance: importance || undefined,
      source: 'ews',
      createdDateTime: createdDateTime || undefined,
      lastModifiedDateTime: lastModifiedDateTime || undefined,
      isMeeting,
      isOrganizer: !isMeeting ? true : undefined,
      type: appointmentType || 'SingleInstance',
      showAs: showAs || undefined,
      responseStatus: myResponseType ? { response: myResponseType } : undefined,
      duration: duration || undefined,
      hasAttachments,
      iCalUId: iCalUId || undefined,
      meetingRequestWasSent,
      allowNewTimeProposal,
      isResponseRequested,
      recurrence,
    })
  }

  return events
}

export async function fetchEwsEventBody(ewsUrl, username, password, domain, itemId, changeKey) {
  const soapBody =
    '<m:GetItem>' +
      '<m:ItemShape>' +
        '<t:BaseShape>Default</t:BaseShape>' +
        '<t:BodyType>HTML</t:BodyType>' +
        '<t:AdditionalProperties>' +
          '<t:FieldURI FieldURI="item:Body"/>' +
          '<t:FieldURI FieldURI="calendar:RequiredAttendees"/>' +
          '<t:FieldURI FieldURI="calendar:OptionalAttendees"/>' +
        '</t:AdditionalProperties>' +
      '</m:ItemShape>' +
      '<m:ItemIds>' +
        '<t:ItemId Id="' + itemId + '"' + (changeKey ? ' ChangeKey="' + changeKey + '"' : '') + '/>' +
      '</m:ItemIds>' +
    '</m:GetItem>'

  const envelope = buildSoapEnvelope(soapBody)
  const responseXml = await ntlmRequest(ewsUrl, username, password, domain, envelope)

  const faultMatch = responseXml.match(/<faultstring>([^<]*)<\/faultstring>/)
  if (faultMatch) throw new Error('EWS: ' + faultMatch[1])

  const bodyMatch = responseXml.match(/<t:Body[^>]*>([\s\S]*?)<\/t:Body>/)
  let bodyContent = bodyMatch ? bodyMatch[1].trim() : ''
  const bodyType = bodyMatch ? (bodyMatch[0].match(/BodyType="([^"]*)"/)?.[1] || 'Text') : 'Text'
  if (bodyContent) {
    bodyContent = bodyContent.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  }

  const attendees = []
  const reqSection = responseXml.match(/<t:RequiredAttendees>([\s\S]*?)<\/t:RequiredAttendees>/)
  if (reqSection) {
    const mailboxes = reqSection[1].match(/<t:Attendee[\s\S]*?<\/t:Attendee>/g) || []
    for (const mb of mailboxes) {
      const name = extractTag(mb, 't:Name')
      const addr = extractAttr(mb, 't:Mailbox', 'EmailAddress')
      const resp = extractTag(mb, 't:ResponseType')
      if (name || addr) attendees.push({ emailAddress: { name, address: addr }, type: 'required', status: { response: resp || 'none' } })
    }
  }
  const optSection = responseXml.match(/<t:OptionalAttendees>([\s\S]*?)<\/t:OptionalAttendees>/)
  if (optSection) {
    const mailboxes = optSection[1].match(/<t:Attendee[\s\S]*?<\/t:Attendee>/g) || []
    for (const mb of mailboxes) {
      const name = extractTag(mb, 't:Name')
      const addr = extractAttr(mb, 't:Mailbox', 'EmailAddress')
      const resp = extractTag(mb, 't:ResponseType')
      if (name || addr) attendees.push({ emailAddress: { name, address: addr }, type: 'optional', status: { response: resp || 'none' } })
    }
  }

  return {
    body: bodyContent ? { content: bodyContent, contentType: bodyType } : undefined,
    attendees: attendees.length > 0 ? attendees : undefined,
  }
}

function ntlmRequest(ewsUrl, username, password, domain, envelope) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(ewsUrl)
    const agent = parsed.protocol === 'https:'
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined

    httpntlm.post({
      url: ewsUrl,
      username: username,
      password: password,
      domain: domain || '',
      workstation: '',
      body: envelope,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'User-Agent': 'WorkerCabinet/1.0',
        'Accept': 'text/xml',
      },
      agent: agent,
      rejectUnauthorized: false,
    }, (err, res) => {
      if (err) return reject(err)
      if (res.statusCode === 401) {
        return reject(new Error('Неверный логин или пароль. Проверьте домен, логин и пароль.'))
      }
      if (res.statusCode >= 400) {
        return reject(new Error('EWS HTTP ' + res.statusCode + ': ' + (res.body || '').substring(0, 200)))
      }
      resolve(res.body)
    })
  })
}

export async function fetchEwsEvents(ewsUrl, username, password, domain, startIso, endIso) {
  const soapBody =
    '<m:FindItem Traversal="Shallow">' +
      '<m:ItemShape>' +
        '<t:BaseShape>Default</t:BaseShape>' +
        '<t:BodyType>HTML</t:BodyType>' +
        '<t:AdditionalProperties>' +
          '<t:FieldURI FieldURI="item:Subject"/>' +
          '<t:FieldURI FieldURI="calendar:Start"/>' +
          '<t:FieldURI FieldURI="calendar:End"/>' +
          '<t:FieldURI FieldURI="calendar:IsAllDayEvent"/>' +
          '<t:FieldURI FieldURI="calendar:Location"/>' +
          '<t:FieldURI FieldURI="calendar:Organizer"/>' +
          '<t:FieldURI FieldURI="item:Categories"/>' +
          '<t:FieldURI FieldURI="item:Body"/>' +
          '<t:FieldURI FieldURI="calendar:RequiredAttendees"/>' +
          '<t:FieldURI FieldURI="calendar:OptionalAttendees"/>' +
          '<t:FieldURI FieldURI="item:Sensitivity"/>' +
          '<t:FieldURI FieldURI="item:Importance"/>' +
          '<t:FieldURI FieldURI="item:DateTimeCreated"/>' +
          '<t:FieldURI FieldURI="item:LastModifiedTime"/>' +
          '<t:FieldURI FieldURI="calendar:IsMeeting"/>' +
          '<t:FieldURI FieldURI="calendar:LegacyFreeBusyStatus"/>' +
          '<t:FieldURI FieldURI="item:HasAttachments"/>' +
          '<t:FieldURI FieldURI="calendar:UID"/>' +
        '</t:AdditionalProperties>' +
      '</m:ItemShape>' +
      '<m:CalendarView StartDate="' + startIso + '" EndDate="' + endIso + '" MaxEntriesReturned="200"/>' +
      '<m:ParentFolderIds>' +
        '<t:DistinguishedFolderId Id="calendar"/>' +
      '</m:ParentFolderIds>' +
    '</m:FindItem>'

  const envelope = buildSoapEnvelope(soapBody)

  console.log('[EWS] NTLM auth to:', ewsUrl, 'user:', username, 'domain:', domain || '(none)')

  const responseXml = await ntlmRequest(ewsUrl, username, password, domain, envelope)

  const faultMatch = responseXml.match(/<faultstring>([^<]*)<\/faultstring>/)
  if (faultMatch) {
    throw new Error('EWS: ' + faultMatch[1])
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
