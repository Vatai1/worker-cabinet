const HUSHING = /[гкхжчшщ]$/

const endA = (stem) => stem + (HUSHING.test(stem) ? 'и' : 'ы')

function maleSurname(s) {
  if (/(ск|цк)ий$/.test(s) || /[ыо]й$/.test(s)) return s.slice(0, -2) + 'ого'
  if (/ий$/.test(s)) return s.slice(0, -2) + 'ия'
  if (/[йь]$/.test(s)) return s.slice(0, -1) + 'я'
  if (/а$/.test(s)) return endA(s.slice(0, -1))
  if (/я$/.test(s)) return s.slice(0, -1) + 'и'
  if (/(ых|их)$/.test(s) || /[еёиоуыэю]$/.test(s)) return s
  return s + 'а'
}

function femaleSurname(s) {
  if (/(ов|ев|ёв|ин|ын)а$/.test(s)) return s.slice(0, -1) + 'ой'
  if (/ая$/.test(s)) return s.slice(0, -2) + 'ой'
  if (/яя$/.test(s)) return s.slice(0, -2) + 'ей'
  if (/а$/.test(s)) return endA(s.slice(0, -1))
  if (/я$/.test(s)) return s.slice(0, -1) + 'и'
  return s
}

const MALE_NAME_EXCEPTIONS = { пётр: 'петра', петр: 'петра', лев: 'льва', павел: 'павла' }

function maleFirstName(s) {
  if (MALE_NAME_EXCEPTIONS[s]) return MALE_NAME_EXCEPTIONS[s]
  if (/[йь]$/.test(s)) return s.slice(0, -1) + 'я'
  if (/а$/.test(s)) return endA(s.slice(0, -1))
  if (/я$/.test(s)) return s.slice(0, -1) + 'и'
  if (/[еёиоуыэю]$/.test(s)) return s
  return s + 'а'
}

function femaleFirstName(s) {
  if (/ия$/.test(s)) return s.slice(0, -1) + 'и'
  if (/а$/.test(s)) return endA(s.slice(0, -1))
  if (/[яь]$/.test(s)) return s.slice(0, -1) + 'и'
  return s
}

function patronymic(s) {
  if (/ич$/.test(s)) return s + 'а'
  if (/на$/.test(s)) return s.slice(0, -1) + 'ы'
  return s
}

function isFemale({ middleName, gender }) {
  if (/на$/i.test(middleName || '')) return true
  if (/ич$/i.test(middleName || '')) return false
  return /^(f|female|ж|жен|женский)/i.test(String(gender || ''))
}

const declineWord = (word, fn) => {
  if (!word) return ''
  if (!/[а-яё]/i.test(word)) return word
  return word.split('-').map((part) => {
    const lower = part.toLowerCase()
    const declined = fn(lower)
    return part.slice(0, 1) + declined.slice(1)
  }).join('-')
}

export function suggestGenitive({ lastName, firstName, middleName, gender }) {
  const female = isFemale({ middleName, gender })
  return {
    lastName: declineWord(lastName, female ? femaleSurname : maleSurname),
    firstName: declineWord(firstName, female ? femaleFirstName : maleFirstName),
    middleName: declineWord(middleName, patronymic),
  }
}

export function genitiveOf(user) {
  const saved = user.name_genitive
  if (saved?.lastName && saved?.firstName) return saved
  return suggestGenitive({
    lastName: user.last_name, firstName: user.first_name, middleName: user.middle_name, gender: user.gender,
  })
}

export function genitiveTemplateData(user) {
  const g = genitiveOf(user)
  const initials = [g.firstName?.[0], g.middleName?.[0]].filter(Boolean).map((c) => c + '.').join('')
  return {
    full_name_gen: [g.lastName, g.firstName, g.middleName].filter(Boolean).join(' '),
    short_name_gen: [g.lastName, initials].filter(Boolean).join(' '),
    last_name_gen: g.lastName || '',
    first_name_gen: g.firstName || '',
    middle_name_gen: g.middleName || '',
  }
}

const ADJECTIVE = /(ый|ий|ой|ая|яя|ое|ее)$/

function adjective(word) {
  if (/(ний|[жчшщ]ий)$/.test(word)) return word.slice(0, -2) + 'его'
  if (/(ый|ий|ой)$/.test(word)) return word.slice(0, -2) + 'ого'
  if (/ая$/.test(word)) return word.slice(0, -2) + 'ой'
  if (/яя$/.test(word)) return word.slice(0, -2) + 'ей'
  if (/ое$/.test(word)) return word.slice(0, -2) + 'ого'
  if (/ее$/.test(word)) return word.slice(0, -2) + 'его'
  return word
}

function noun(word, feminine) {
  if (/ь$/.test(word) && (feminine || /сть$/.test(word))) return word.slice(0, -1) + 'и'
  if (/ие$/.test(word)) return word.slice(0, -1) + 'я'
  if (/ия$/.test(word)) return word.slice(0, -1) + 'и'
  if (/а$/.test(word)) return endA(word.slice(0, -1))
  if (/я$/.test(word)) return word.slice(0, -1) + 'и'
  if (/ь$/.test(word)) return word.slice(0, -1) + 'я'
  if (/й$/.test(word)) return word.slice(0, -1) + 'я'
  if (/[бвгджзклмнпрстфхцчшщ]$/.test(word)) return word + 'а'
  return word
}

const keepCase = (original, declined) => {
  const lower = original.toLowerCase()
  let i = 0
  while (i < lower.length && lower[i] === declined[i]) i++
  return original.slice(0, i) + declined.slice(i)
}

export function suggestPhraseGenitive(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean)
  const cyrillic = (w) => /[а-яё]$/i.test(w) && /^[a-zа-яё0-9-]+$/i.test(w)
  let i = words.findIndex(cyrillic)
  if (i === -1) return words.join(' ')
  let feminine = false
  while (i < words.length - 1 && ADJECTIVE.test(words[i].toLowerCase()) && cyrillic(words[i])) {
    feminine = /(ая|яя)$/i.test(words[i])
    words[i] = keepCase(words[i], adjective(words[i].toLowerCase()))
    i++
  }
  if (i < words.length && cyrillic(words[i])) words[i] = keepCase(words[i], noun(words[i].toLowerCase(), feminine))
  return words.join(' ')
}

export const suggestDepartmentGenitive = suggestPhraseGenitive
export const suggestPositionGenitive = suggestPhraseGenitive

export const departmentGenitive = (d) => d?.name_genitive || suggestDepartmentGenitive(d?.name)
export const positionGenitive = (position, saved) => (position ? saved || suggestPositionGenitive(position) : '')
