import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select } from './Select'
import { SelectDropdown } from './SelectDropdown'
import { MultiSelectDropdown } from './MultiSelectDropdown'

afterEach(cleanup)

const options = [
  { value: '1', label: 'Администрация' },
  { value: '2', label: 'Бухгалтерия', disabled: true },
  { value: '3', label: 'Отдел кадров' },
]

describe('Единые селекты', () => {
  it('сохраняет числовые значения, подписи, группы и недоступные варианты', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select id="department" aria-label="Подразделение" value={1} onChange={onChange}>
      <optgroup label="Отделы">
        <option value={1}>Администрация</option>
        <option value={2} disabled>Бухгалтерия</option>
        <option value={3} title="Кадровая служба">Отдел кадров</option>
      </optgroup>
    </Select>)
    const trigger = screen.getByRole('combobox', { name: 'Подразделение' })
    expect(trigger.textContent).toContain('Администрация')
    await user.click(trigger)
    expect(screen.getByText('Отделы')).toBeTruthy()
    const disabled = screen.getByRole('option', { name: 'Бухгалтерия' })
    expect(disabled.getAttribute('aria-disabled')).toBe('true')
    await user.click(disabled)
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('option', { name: 'Отдел кадров' }))
    expect(onChange).toHaveBeenCalledWith('3')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('управляется стрелками и пропускает недоступные варианты', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SelectDropdown aria-label="Отдел" options={options} value="1" onChange={onChange} />)
    const trigger = screen.getByRole('combobox')
    trigger.focus()
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('3')
    expect(document.activeElement).toBe(trigger)
  })

  it('поддерживает Home, End и набор начала названия', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SelectDropdown options={options} value="1" onChange={onChange} />)
    screen.getByRole('combobox').focus()
    await user.keyboard('{ArrowDown}{End}{Home}{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('1')
    await user.keyboard('О{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('3')
  })

  it('ищет в длинных списках и показывает пустой результат', async () => {
    const user = userEvent.setup()
    render(<SelectDropdown aria-label="Организация" options={Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: `Организация ${i}` }))} value="0" onChange={vi.fn()} />)
    await user.click(screen.getByRole('combobox', { name: 'Организация' }))
    const search = screen.getByRole('combobox', { name: 'Поиск…' })
    expect(document.activeElement).toBe(search)
    await user.type(search, 'Организация 7')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.clear(search)
    await user.type(search, 'Нет такой организации')
    expect(screen.getByRole('status').textContent).toContain('Ничего не найдено')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('поддерживает несколько значений и сброс без закрытия списка', async () => {
    const user = userEvent.setup()
    function Fixture() {
      const [selected, setSelected] = useState<string[]>([])
      return <MultiSelectDropdown aria-label="Отделы" options={options} selected={selected} onChange={setSelected} placeholder="Все отделы" countLabel="Отделов" searchable />
    }
    render(<Fixture />)
    await user.click(screen.getByRole('combobox', { name: 'Отделы' }))
    await user.click(screen.getByRole('option', { name: 'Администрация' }))
    await user.click(screen.getByRole('option', { name: 'Отдел кадров' }))
    expect(screen.getByRole('combobox', { name: 'Отделы' }).textContent).toContain('Отделов: 2')
    expect(screen.getByRole('option', { name: 'Администрация' }).getAttribute('aria-selected')).toBe('true')
    await user.click(screen.getByRole('option', { name: 'Все отделы' }))
    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Отделы' }).textContent).toContain('Все отделы')
  })

  it('закрывается по Escape и не закрывает родительскую модалку', async () => {
    const user = userEvent.setup()
    const parentEscape = vi.fn()
    window.addEventListener('keydown', parentEscape)
    try {
      render(<SelectDropdown options={options} value="1" onChange={vi.fn()} />)
      const trigger = screen.getByRole('combobox')
      await user.click(trigger)
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('listbox')).toBeNull()
      expect(parentEscape).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(trigger)
    } finally {
      window.removeEventListener('keydown', parentEscape)
    }
  })

  it('закрывается при клике снаружи и сохраняет порядок Tab после поиска', async () => {
    const user = userEvent.setup()
    render(<><SelectDropdown options={options} value="1" onChange={vi.fn()} searchable /><button>Далее</button></>)
    const trigger = screen.getByRole('combobox', { name: 'Администрация' })
    await user.click(trigger)
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Далее' }))
    expect(screen.queryByRole('listbox')).toBeNull()
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Далее' }))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('не отправляет форму при выборе и сохраняет связь с label', async () => {
    const user = userEvent.setup()
    const submit = vi.fn(event => event.preventDefault())
    render(<form onSubmit={submit}><label htmlFor="status">Статус</label><Select id="status" value="a" onChange={vi.fn()}><option value="a">Активный</option><option value="b">Архив</option></Select></form>)
    await user.click(screen.getByText('Статус'))
    expect(document.activeElement).toBe(screen.getByRole('combobox'))
    await user.keyboard('{Enter}{ArrowDown}{Enter}')
    expect(submit).not.toHaveBeenCalled()
  })

  it('не открывается в отключённом состоянии', async () => {
    const user = userEvent.setup()
    render(<SelectDropdown disabled options={options} value="1" onChange={vi.fn()} />)
    await user.click(screen.getByRole('combobox'))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('выносит список из контейнера со скрытым переполнением и открывает вверх у края экрана', async () => {
    const user = userEvent.setup()
    const { container } = render(<div style={{ overflow: 'hidden' }}><SelectDropdown options={options} value="1" onChange={vi.fn()} /></div>)
    const trigger = screen.getByRole('combobox')
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ x: 30, y: 700, top: 700, bottom: 740, left: 30, right: 230, width: 200, height: 40, toJSON() {} })
    await user.click(trigger)
    const popup = screen.getByRole('listbox').parentElement!
    expect(container.contains(popup)).toBe(false)
    expect(popup.style.position).toBe('fixed')
    expect(popup.style.bottom).not.toBe('')
    expect(within(popup).getAllByRole('option')).toHaveLength(3)
    fireEvent.resize(window)
  })
})
