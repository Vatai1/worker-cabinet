export interface Placeholder {
  tag: string
  desc: string
}

export interface PlaceholderGroup {
  label: string
  items: Placeholder[]
}

const GROUPS = {
  person: {
    label: 'ФИО и должность',
    items: [
      { tag: '{full_name}', desc: 'Полное ФИО (Фамилия Имя Отчество)' },
      { tag: '{short_name}', desc: 'Краткое ФИО (Фамилия И.О.)' },
      { tag: '{last_name}', desc: 'Фамилия' },
      { tag: '{first_name}', desc: 'Имя' },
      { tag: '{middle_name}', desc: 'Отчество' },
      { tag: '{position}', desc: 'Должность' },
      { tag: '{department}', desc: 'Отдел' },
    ],
  },
  meta: {
    label: 'Документ',
    items: [
      { tag: '{date_today}', desc: 'Дата генерации (ДД.ММ.ГГГГ)' },
      { tag: '{year}', desc: 'Год' },
    ],
  },
  vacation_list: {
    label: 'Отпуска (итоги)',
    items: [
      { tag: '{vacations_count}', desc: 'Количество отпусков' },
      { tag: '{total_days}', desc: 'Суммарно дней' },
    ],
  },
  vacation_loop: {
    label: 'Отпуска (цикл по строкам)',
    items: [
      { tag: '{#vacations}', desc: 'Начало цикла' },
      { tag: '{/vacations}', desc: 'Конец цикла' },
      { tag: '{num}', desc: 'Порядковый номер' },
      { tag: '{type}', desc: 'Тип отпуска' },
      { tag: '{start}', desc: 'Дата начала' },
      { tag: '{end}', desc: 'Дата окончания' },
      { tag: '{days}', desc: 'Количество дней' },
      { tag: '{status}', desc: 'Статус заявки' },
    ],
  },
  transfer: {
    label: 'Перенос отпуска (цикл по строкам)',
    items: [
      { tag: '{#transfers}', desc: 'Начало цикла переносов' },
      { tag: '{/transfers}', desc: 'Конец цикла переносов' },
      { tag: '{original_start}', desc: 'Исходная дата начала' },
      { tag: '{original_days}', desc: 'Исходное количество дней' },
      { tag: '{new_start}', desc: 'Новая дата начала' },
      { tag: '{new_days}', desc: 'Новое количество дней' },
      { tag: '{delta_direction}', desc: 'Направление изменения (увеличив / сократив)' },
      { tag: '{delta_days}', desc: 'На сколько дней изменился отпуск' },
      { tag: '{note}', desc: 'Доп. пометка (напр. «с оплатой проезда до города»)' },
    ],
  },
}

export const PLACEHOLDERS_BY_PURPOSE: Record<string, PlaceholderGroup[]> = {
  vacation_template: [
    GROUPS.person,
    GROUPS.meta,
    GROUPS.vacation_list,
    GROUPS.vacation_loop,
  ],
  vacation_transfer_template: [
    GROUPS.person,
    GROUPS.meta,
    GROUPS.transfer,
  ],
}

export const getAllGroups = (): PlaceholderGroup[] => {
  const seen = new Set<string>()
  const result: PlaceholderGroup[] = []
  for (const groups of Object.values(PLACEHOLDERS_BY_PURPOSE)) {
    for (const group of groups) {
      if (!seen.has(group.label)) {
        seen.add(group.label)
        result.push(group)
      }
    }
  }
  return result
}

export const getAllPlaceholders = (): Placeholder[] =>
  getAllGroups().flatMap(g => g.items)
