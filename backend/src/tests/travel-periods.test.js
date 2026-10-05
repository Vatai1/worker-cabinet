import { describe, it } from 'node:test'
import assert from 'node:assert'
import { computeTravel } from '../lib/travel.js'

const today = new Date('2026-10-06T00:00:00Z')
const req = (id, start, status = 'approved') => ({ id, start_date: start, end_date: start, travel_destination: 'Сочи', status })

describe('Проезд: двухлетние периоды от даты найма', () => {
  it('в первом периоде право возникает через 6 месяцев работы', () => {
    const fresh = computeTravel({ hireDate: '2026-09-30', requests: [], today })
    assert.strictEqual(fresh.periods[0].eligible_from, '2027-03-30')
    assert.strictEqual(fresh.next_available_date, '2027-03-30')
    assert.strictEqual(fresh.available_until, '2028-09-29')
    assert.strictEqual(fresh.date_ok, false)

    const sixMonths = computeTravel({ hireDate: '2025-03-10', requests: [], today })
    assert.strictEqual(sixMonths.next_available_date, '2025-09-10')
    assert.strictEqual(sixMonths.date_ok, true)
  })

  it('6 месяцев от конца месяца: 31.08 → 28.02', () => {
    const s = computeTravel({ hireDate: '2025-08-31', requests: [], today })
    assert.strictEqual(s.periods[0].eligible_from, '2026-02-28')
  })

  it('использованный первый период — доступен со второго', () => {
    const s = computeTravel({ hireDate: '2025-03-10', requests: [req(1, '2026-06-01')], today })
    assert.strictEqual(s.next_available_date, '2027-03-10')
    assert.strictEqual(s.date_ok, false)
  })

  it('неиспользованный текущий период — доступен с его начала', () => {
    const s = computeTravel({ hireDate: '2023-01-15', requests: [], today })
    assert.strictEqual(s.next_available_date, '2025-01-15')
    assert.strictEqual(s.available_until, '2027-01-14')
    assert.strictEqual(s.date_ok, true)
  })

  it('использованный текущий период — доступен со следующего', () => {
    const s = computeTravel({ hireDate: '2023-01-15', requests: [req(1, '2026-07-01')], today })
    assert.strictEqual(s.next_available_date, '2027-01-15')
    assert.strictEqual(s.date_ok, false)
    const current = s.periods.find((p) => p.current)
    assert.deepStrictEqual([current.start, current.end, current.used.length], ['2025-01-15', '2027-01-14', 1])
  })

  it('граница периода: отпуск в последний день периода относится к нему', () => {
    const s = computeTravel({ hireDate: '2023-01-15', requests: [req(1, '2027-01-14')], today })
    assert.strictEqual(s.periods.find((p) => p.start === '2025-01-15').used.length, 1)
  })

  it('отклонённые и отменённые заявки не учитываются, на согласовании — блокирует', () => {
    const s = computeTravel({ hireDate: '2023-01-15', requests: [req(2, '2026-08-01', 'on_approval')], today })
    assert.strictEqual(s.date_ok, true)
    assert.strictEqual(s.pending.id, 2)
  })

  it('ручная дата HR имеет приоритет', () => {
    const s = computeTravel({ hireDate: '2023-01-15', override: '2026-12-01', requests: [], today })
    assert.strictEqual(s.next_available_date, '2026-12-01')
    assert.strictEqual(s.override, '2026-12-01')
    assert.strictEqual(s.date_ok, false)
  })

  it('найм 29 февраля', () => {
    const s = computeTravel({ hireDate: '2020-02-29', requests: [], today })
    assert.deepStrictEqual(s.periods.slice(0, 3).map((p) => p.start), ['2020-02-29', '2022-02-28', '2024-02-29'])
  })
})
