import { describe, it } from 'node:test'
import assert from 'node:assert'
import { suggestGenitive, genitiveTemplateData, suggestDepartmentGenitive, departmentGenitive } from '../lib/nameGenitive.js'

const gen = (fio, gender) => {
  const [lastName, firstName, middleName] = fio.split(' ')
  return Object.values(suggestGenitive({ lastName, firstName, middleName, gender })).filter(Boolean).join(' ')
}

describe('ФИО в родительном падеже', () => {
  it('мужские ФИО', () => {
    assert.strictEqual(gen('Иванов Иван Иванович'), 'Иванова Ивана Ивановича')
    assert.strictEqual(gen('Антипов Евгений Александрович'), 'Антипова Евгения Александровича')
    assert.strictEqual(gen('Достоевский Фёдор Михайлович'), 'Достоевского Фёдора Михайловича')
    assert.strictEqual(gen('Толстой Лев Николаевич'), 'Толстого Льва Николаевича')
    assert.strictEqual(gen('Гоголь Игорь Ильич'), 'Гоголя Игоря Ильича')
    assert.strictEqual(gen('Седых Никита Сергеевич'), 'Седых Никиты Сергеевича')
    assert.strictEqual(gen('Шевченко Илья Петрович'), 'Шевченко Ильи Петровича')
    assert.strictEqual(gen('Петров Пётр Петрович'), 'Петрова Петра Петровича')
    assert.strictEqual(gen('Орлов Павел Андреевич'), 'Орлова Павла Андреевича')
  })

  it('женские ФИО', () => {
    assert.strictEqual(gen('Петрова Анна Сергеевна'), 'Петровой Анны Сергеевны')
    assert.strictEqual(gen('Луговская Мария Ивановна'), 'Луговской Марии Ивановны')
    assert.strictEqual(gen('Ким Ольга Олеговна'), 'Ким Ольги Олеговны')
    assert.strictEqual(gen('Соколова-Гусева Любовь Петровна'), 'Соколовой-Гусевой Любови Петровны')
  })

  it('латиница не склоняется', () => {
    assert.strictEqual(gen('Smith John'), 'Smith John')
  })

  it('пол без отчества берётся из профиля', () => {
    assert.strictEqual(gen('Смирнова Елена', 'female'), 'Смирновой Елены')
    assert.strictEqual(gen('Смирнов Олег', 'male'), 'Смирнова Олега')
  })

  it('в шаблон идёт сохранённый вариант, если он есть', () => {
    const user = { last_name: 'Лев', first_name: 'Павел', middle_name: 'Андреевич', name_genitive: { lastName: 'Льва', firstName: 'Павла', middleName: 'Андреевича' } }
    assert.deepStrictEqual(genitiveTemplateData(user), {
      full_name_gen: 'Льва Павла Андреевича',
      short_name_gen: 'Льва П.А.',
      last_name_gen: 'Льва',
      first_name_gen: 'Павла',
      middle_name_gen: 'Андреевича',
    })
    assert.strictEqual(genitiveTemplateData({ ...user, name_genitive: null }).first_name_gen, 'Павла')
  })

  it('названия отделов', () => {
    const cases = {
      'Отдел дизайна': 'Отдела дизайна',
      'Юридический отдел': 'Юридического отдела',
      'Общий отдел': 'Общего отдела',
      'Бухгалтерия': 'Бухгалтерии',
      'Управление делами': 'Управления делами',
      'Служба безопасности': 'Службы безопасности',
      'Дежурная часть': 'Дежурной части',
      'Финансово-экономический отдел': 'Финансово-экономического отдела',
      'IT-отдел': 'IT-отдел',
      'HR отдел': 'HR отдела',
      'US9 Другой отдел vac-full': 'US9 Другого отдела vac-full',
    }
    for (const [name, expected] of Object.entries(cases)) assert.strictEqual(suggestDepartmentGenitive(name), expected)
    assert.strictEqual(departmentGenitive({ name: 'Отдел ИТ', name_genitive: 'IT-отдела' }), 'IT-отдела')
  })
})
