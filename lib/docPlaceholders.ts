export interface Placeholder {
  tag: string
  desc: string
}

export const PLACEHOLDERS_BY_PURPOSE: Record<string, Placeholder[]> = {
  vacation_template: [
    { tag: '{full_name}', desc: 'Полное ФИО' },
    { tag: '{short_name}', desc: 'Краткое ФИО (Фамилия И.О.)' },
    { tag: '{last_name}', desc: 'Фамилия' },
    { tag: '{first_name}', desc: 'Имя' },
    { tag: '{middle_name}', desc: 'Отчество' },
    { tag: '{position}', desc: 'Должность' },
    { tag: '{department}', desc: 'Отдел' },
    { tag: '{year}', desc: 'Год' },
    { tag: '{date_today}', desc: 'Дата генерации (ДД.ММ.ГГГГ)' },
    { tag: '{vacations_count}', desc: 'Количество отпусков' },
    { tag: '{total_days}', desc: 'Суммарно дней' },
    { tag: '{#vacations}', desc: 'Начало цикла по отпускам' },
    { tag: '{/vacations}', desc: 'Конец цикла по отпускам' },
    { tag: '{num}', desc: 'Порядковый номер (в цикле)' },
    { tag: '{type}', desc: 'Тип отпуска (в цикле)' },
    { tag: '{start}', desc: 'Дата начала (в цикле)' },
    { tag: '{end}', desc: 'Дата окончания (в цикле)' },
    { tag: '{days}', desc: 'Дней (в цикле)' },
    { tag: '{status}', desc: 'Статус (в цикле)' },
  ],
  vacation_transfer_template: [
    { tag: '{full_name}', desc: 'Полное ФИО' },
    { tag: '{short_name}', desc: 'Краткое ФИО (Фамилия И.О.)' },
    { tag: '{last_name}', desc: 'Фамилия' },
    { tag: '{first_name}', desc: 'Имя' },
    { tag: '{middle_name}', desc: 'Отчество' },
    { tag: '{position}', desc: 'Должность' },
    { tag: '{department}', desc: 'Отдел' },
    { tag: '{date_today}', desc: 'Дата генерации (ДД.ММ.ГГГГ)' },
    { tag: '{original_start}', desc: 'Исходная дата начала отпуска' },
    { tag: '{original_end}', desc: 'Исходная дата окончания' },
    { tag: '{original_days}', desc: 'Исходное количество дней' },
    { tag: '{new_start}', desc: 'Новая дата начала' },
    { tag: '{new_end}', desc: 'Новая дата окончания' },
    { tag: '{reason}', desc: 'Причина переноса' },
  ],
}

export const getAllPlaceholders = (): Placeholder[] =>
  Object.values(PLACEHOLDERS_BY_PURPOSE)
    .flat()
    .filter((p, i, a) => a.findIndex(x => x.tag === p.tag) === i)
