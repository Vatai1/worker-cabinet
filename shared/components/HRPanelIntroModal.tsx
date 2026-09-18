import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Sparkles } from 'lucide-react'
import { Card } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { cn } from '@/shared/lib/utils'

interface IntroTab {
  id: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}

interface IntroGroup {
  label: string
  tabs: IntroTab[]
}

interface HRPanelIntroModalProps {
  open: boolean
  onClose: () => void
  groups: IntroGroup[]
  activeTabId?: string
}

const TAB_DETAILS: Record<string, string[]> = {
  surveys: [
    'Создайте опрос с вопросами и вариантами ответов, выберите получателей — всех работников, отдел или конкретных людей',
    'После отправки видно, кто уже прошёл опрос, а кто ещё нет',
    'В карточке опроса — аналитика по ответам',
  ],
  mailing: [
    'Составьте сообщение и выберите получателей — всех работников, отдел или список',
    'Рассылка приходит работникам в уведомления',
    'История рассылок сохраняется — видно, кому и когда отправлено',
  ],
  onboarding: [
    'Создайте нового работника и сразу прикрепите шаблоны документов на подпись',
    'Пока не все документы подтверждены, у работника роль «Онбординг» — виден только ограниченный набор разделов',
    'Когда работник подтвердил все документы, роль автоматически меняется на «Работник»',
  ],
  timesheet: [
    'Табель создаётся на месяц по отделу — дни заполняются автоматически: явка, выходные, дни по одобренным отпускам',
    'Статусы: черновик → отправлен → согласован; редактировать можно только черновик',
    'Согласовать табель или вернуть на доработку может только HR/админ',
  ],
  vacation: [
    'Вкладка «Календарь» — годовой календарь отпусков всех работников с поиском и фильтрами по месяцу, отделу, статусу и типу',
    'Вкладка «Дни отпуска» — сколько дней доступно по умолчанию, по должностям и лично конкретным работникам',
    'Вкладка «Доступ» — точечная или массовая блокировка подачи новых заявок по отделам',
  ],
  hierarchy: [
    'Оргструктура в виде схемы: отделы, работники и вакантные должности как блоки',
    'Перетаскивайте блоки и соединяйте связями — от связи зависит подчинённость и наследование настроек отпусков',
    'Изменения в диаграмме сохраняются и синхронизируются с реальной структурой отделов и руководителей',
  ],
  'doc-templates': [
    'Загрузите doc/docx-шаблон и укажите его назначение — например, заявление на отпуск или на перенос',
    'В тексте шаблона используйте плейсхолдеры — при генерации документа они подставляются автоматически',
    'Готовый документ можно скачать или открыть на просмотр и редактирование прямо в браузере',
  ],
  institution: [
    'Название, ИНН и адрес организации',
    'Назначение или замена руководителя учреждения — выбирается из списка работников',
  ],
  hr_departments: [
    'Создание отделов, назначение руководителя и родительского подразделения',
    'Поиск по названию/руководителю и сортировка по алфавиту или числу работников',
  ],
  hr_positions: [
    'Список формируется автоматически из поля «Должность» в профилях работников — отдельно должности не заводятся',
    'Переименование обновит должность сразу у всех, у кого она указана; удаление — очистит поле',
    'Значок «Работники» у должности показывает, кто её сейчас занимает',
  ],
  hr_vacation_types: [
    'Справочник видов отпуска — ежегодный, без сохранения зарплаты и другие — с короткими кодами',
    'Этот список работник видит при выборе типа в заявлении на отпуск',
  ],
  hr_skills: [
    'Тегами отмечают навыки и особенности работников — используются в поиске по работникам',
    'Тег можно назначить сразу нескольким работникам через «Назначить работникам»',
    'Теги также используются как условие в ограничениях на одновременный отпуск нескольких работников',
  ],
}

export function HRPanelIntroModal({ open, onClose, groups, activeTabId }: HRPanelIntroModalProps) {
  useModalOpen(open)
  const allTabs = groups.flatMap((g) => g.tabs)
  const [selectedId, setSelectedId] = useState<string | null>(allTabs[0]?.id ?? null)
  const selectedRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const fallback = allTabs[0]?.id ?? null
    const initial = activeTabId && allTabs.some((t) => t.id === activeTabId) ? activeTabId : fallback
    setSelectedId(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeTabId])

  useEffect(() => {
    if (!open) return
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open, selectedId])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const selected = allTabs.find((t) => t.id === selectedId) ?? allTabs[0]
  const SelectedIcon = selected?.icon

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="fixed inset-0" onClick={onClose} />
      <Card className="relative flex w-full max-w-2xl max-h-[85vh] flex-col overflow-hidden p-0 shadow-2xl animate-scale-in">
        <div className="relative shrink-0 overflow-hidden gradient-primary px-5 pb-5 pt-5 text-white">
          <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/5" />
          <div className="absolute -bottom-12 left-10 h-24 w-24 rounded-full bg-white/5" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Sparkles className="h-[18px] w-[18px]" />
              </div>
              <div>
                <h2 className="text-[17px] font-bold leading-tight">Как устроена HR-панель</h2>
                <p className="mt-0.5 text-[12.5px] text-white/70">Выберите раздел слева, чтобы увидеть подробности</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-[220px] shrink-0 overflow-y-auto scrollbar-thin overscroll-contain border-r border-border p-2.5">
            {groups.map((group) => (
              <div key={group.label} className="mb-1 last:mb-0">
                <p className="px-2 pb-1 pt-2.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground/80">{group.label}</p>
                {group.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    ref={selectedId === tab.id ? selectedRef : undefined}
                    type="button"
                    onClick={() => setSelectedId(tab.id)}
                    className={cn(
                      'mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                      selectedId === tab.id ? 'bg-primary/10' : 'hover:bg-muted/60'
                    )}
                  >
                    <span className={cn('h-2 w-2 shrink-0 rounded-full bg-gradient-to-br', tab.color)} />
                    <span className={cn('truncate text-[13px] font-medium', selectedId === tab.id ? 'text-primary' : 'text-foreground')}>
                      {tab.name}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin overscroll-contain p-5">
            {selected && SelectedIcon && (
              <>
                <div className={cn('mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white', selected.color)}>
                  <SelectedIcon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold leading-tight">{selected.name}</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">{selected.description}</p>
                {TAB_DETAILS[selected.id] && (
                  <ul className="mt-4 space-y-2.5">
                    {TAB_DETAILS[selected.id].map((d, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                        {d}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>

        <div className="border-t border-border p-4 shrink-0">
          <Button className="w-full" onClick={onClose}>Понятно</Button>
        </div>
      </Card>
    </div>,
    document.body
  )
}
