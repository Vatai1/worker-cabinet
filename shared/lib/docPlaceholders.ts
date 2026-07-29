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
      { tag: '{year}', desc: 'Текущий год' },
      { tag: '{next_year}', desc: 'Следующий год' },
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
      { tag: '{start}', desc: 'Дата начала (ДД.ММ.ГГГГ)' },
      { tag: '{start_day}', desc: 'День начала' },
      { tag: '{start_month}', desc: 'Месяц начала (число)' },
      { tag: '{start_month_name}', desc: 'Месяц начала (словом)' },
      { tag: '{start_year}', desc: 'Год начала' },
      { tag: '{end}', desc: 'Дата окончания (ДД.ММ.ГГГГ)' },
      { tag: '{end_day}', desc: 'День окончания' },
      { tag: '{end_month}', desc: 'Месяц окончания (число)' },
      { tag: '{end_month_name}', desc: 'Месяц окончания (словом)' },
      { tag: '{end_year}', desc: 'Год окончания' },
      { tag: '{days}', desc: 'Количество дней' },
      { tag: '{#has_travel}', desc: 'Начало: блок оплаты проезда' },
      { tag: '{/has_travel}', desc: 'Конец: блок оплаты проезда' },
      { tag: '{^is_last}', desc: 'Разделитель (выводится если НЕ последняя строка)' },
      { tag: '{/is_last}', desc: 'Конец разделителя' },
      { tag: '{travel_destination}', desc: 'Город (для оплаты проезда)' },
      { tag: '{travel_children_count}', desc: 'Количество несовершеннолетних детей' },
      { tag: '{travel_children_list}', desc: 'Список детей (ФИО, дата рождения — по одному на строку)' },
      { tag: '{status}', desc: 'Статус заявки' },
    ],
  },
  transfer: {
    label: 'Перенос отпуска (цикл по строкам)',
    items: [
      { tag: '{#transfers}', desc: 'Начало цикла переносов' },
      { tag: '{/transfers}', desc: 'Конец цикла переносов' },
      { tag: '{original_start}', desc: 'Исходная дата начала (ДД.ММ.ГГГГ)' },
      { tag: '{original_start_day}', desc: 'Исходный день начала' },
      { tag: '{original_start_month}', desc: 'Исходный месяц (число)' },
      { tag: '{original_start_month_name}', desc: 'Исходный месяц (словом)' },
      { tag: '{original_start_year}', desc: 'Исходный год начала' },
      { tag: '{original_days}', desc: 'Исходное количество дней' },
      { tag: '{new_start}', desc: 'Новая дата начала (ДД.ММ.ГГГГ)' },
      { tag: '{new_start_day}', desc: 'Новый день начала' },
      { tag: '{new_start_month}', desc: 'Новый месяц (число)' },
      { tag: '{new_start_month_name}', desc: 'Новый месяц (словом)' },
      { tag: '{new_start_year}', desc: 'Новый год начала' },
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
