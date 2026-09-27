import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Plane, ChevronDown, FilePlus2, UserCheck2, ArrowLeftRight,
  CalendarDays, ShieldAlert, FileText, History,
} from 'lucide-react'
import { Card } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { InstructionVideoPlayer, useInstructionVideos, type InstructionPlacement } from '@/shared/components/InstructionVideos'
import { cn } from '@/shared/lib/utils'

interface VacationIntroModalProps {
  open: boolean
  onClose: () => void
  isManager: boolean
  isAdminOrSuperAdmin: boolean
}

interface Step {
  title: string
  text: string
}

type Accent = 'primary' | 'amber' | 'violet'

const ACCENT: Record<Accent, { chip: string; ring: string; bar: string; dot: string }> = {
  primary: { chip: 'bg-primary/10 text-primary', ring: 'ring-primary/15', bar: 'bg-primary', dot: 'bg-primary/10 text-primary' },
  amber: { chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', ring: 'ring-amber-500/15', bar: 'bg-amber-500', dot: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  violet: { chip: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', ring: 'ring-violet-500/15', bar: 'bg-violet-500', dot: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
}

function Timeline({ steps, accent }: { steps: Step[]; accent: Accent }) {
  const a = ACCENT[accent]
  return (
    <div>
      {steps.map((step, i) => (
        <div key={i} className="relative flex gap-3.5 pb-5 last:pb-0">
          {i < steps.length - 1 && (
            <span className="absolute left-[13px] top-[26px] bottom-0 w-px bg-border" />
          )}
          <span className={cn('relative z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-4 ring-card', a.dot)}>
            {i + 1}
          </span>
          <div className="pt-px">
            <p className="text-sm font-semibold leading-snug">{step.title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function Section({
  id, icon: Icon, title, accent, open, onToggle, children,
}: {
  id: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  accent: Accent
  open: boolean
  onToggle: (id: string) => void
  children: React.ReactNode
}) {
  const a = ACCENT[accent]
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-card transition-shadow', open && `ring-1 ${a.ring}`)}>
      <div className="flex">
        <span className={cn('w-[3px] shrink-0 transition-colors', open ? a.bar : 'bg-transparent')} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onToggle(id)}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-muted/40"
          >
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', a.chip)}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="flex-1 text-[13.5px] font-semibold">{title}</span>
            <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-200', open && 'rotate-180')} />
          </button>
          <div className={cn('grid transition-all duration-300 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
            <div className="overflow-hidden">
              <div className="px-4 pb-4 pl-[46px] pr-4 pt-0.5">{children}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function VacationIntroModal({ open, onClose, isManager, isAdminOrSuperAdmin }: VacationIntroModalProps) {
  useModalOpen(open)
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(['create']))
  const videos = useInstructionVideos()
  const videoFor = (placement: InstructionPlacement) => {
    const video = videos.find((v) => v.placement === placement)
    return video ? <InstructionVideoPlayer key={video.id} video={video} className="mb-4" /> : null
  }

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const createSteps: Step[] = [
    { title: 'Выделите даты в календаре', text: 'на вкладке «Отпуск» кликните на первый день отпуска, затем на последний — откроется форма заявления с уже подставленными датами' },
    { title: 'Укажите тип отпуска', text: 'ежегодный оплачиваемый, без сохранения зарплаты и другие — список зависит от справочника типов отпусков вашей организации' },
    { title: 'При необходимости укажите замещающего', text: 'работника, который будет выполнять ваши задачи на период отпуска' },
    { title: 'Проверьте предупреждения о пересечениях', text: 'если в подразделении/организации включены ограничения, система предупредит, если на эти даты уже в отпуске слишком много работников отдела или тега' },
    { title: 'Отправьте заявку', text: 'она получает статус «На согласовании» и попадает в очередь к вашему руководителю' },
  ]

  const approveSteps: Step[] = [
    { title: 'Заявка появляется на вкладке «Согласование»', text: isManager ? 'у руководителя отдела; HR и админ видят заявки по всей организации' : 'у вашего руководителя отдела' },
    { title: 'Руководитель открывает карточку заявки', text: 'видит период, тип отпуска и может одобрить или отклонить её с указанием причины' },
    ...(isAdminOrSuperAdmin ? [{ title: 'Админ и супер-админ могут отфильтровать список', text: 'по отделу, типу отпуска и ФИО — удобно, когда заявок много' }] : []),
    { title: 'Автор получает уведомление о решении', text: 'статус заявки меняется на «Согласовано» или «Отклонено»' },
    { title: 'Согласованный отпуск виден в календаре', text: 'день закрашивается зелёным; на согласовании — жёлтым, а если в один день есть и то и другое — ячейка делится по диагонали' },
  ]

  const transferSteps: Step[] = [
    { title: 'Перенести можно только уже одобренный отпуск', text: 'заявки со статусом «На согласовании» переносить не нужно — их можно просто отредактировать или отменить' },
    { title: 'Откройте форму переноса', text: 'вкладка «Заявления» → «Заявление на перенос», либо найдите отпуск в календаре или истории и выберите «Перенести»' },
    { title: 'Укажите новые даты', text: 'перенос возможен в пределах того же года; длительность можно изменить, если хватает дней в балансе. Причину указывать необязательно' },
    { title: 'Заявка на перенос уходит на согласование', text: 'тому же руководителю — он увидит её на вкладке «Согласование» как обычную заявку' },
    { title: 'После одобрения старый период закрывается', text: 'новый вступает в силу; дни отпуска не задваиваются. До одобрения действуют исходные даты' },
  ]

  const restrictionSteps: Step[] = [
    { title: 'Откройте вкладку «Пересечения»', text: 'слева форма нового ограничения, справа — действующие ограничения с вашими сотрудниками' },
    { title: 'Выберите сотрудников', text: 'список содержит сотрудников вашего отдела; тег помогает быстро найти нужных. Достаточно одного человека' },
    { title: 'Укажите лимит', text: 'сколько человек из группы могут одновременно находиться в отпуске' },
    { title: 'Следите за текущими пересечениями', text: 'ниже показаны актуальные пересечения ваших сотрудников; прошедшие отпуска не учитываются' },
  ]

  const features: { icon: React.ComponentType<{ className?: string }>; text: string }[] = [
    { icon: CalendarDays, text: 'Отпуск — календарь на год, баланс дней и ваши заявки; вкладка «Вся команда» показывает отпуска коллег с фильтрами по отделу и типу' },
    ...(isManager ? [{ icon: UserCheck2, text: 'Согласование — заявки работников, ожидающие вашего решения' }] : []),
    ...(isManager ? [{ icon: ShieldAlert, text: 'Пересечения — ограничения на одновременный отпуск нескольких работников' }] : []),
    { icon: FileText, text: 'Заявления — формы для нового заявления на отпуск или на перенос уже одобренного' },
    { icon: History, text: 'История — все прошлые и текущие заявки с их статусами' },
  ]

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="fixed inset-0" onClick={onClose} />
      <Card className="relative flex w-full max-w-xl max-h-[88vh] flex-col overflow-hidden p-0 shadow-2xl animate-scale-in">
        <div className="relative shrink-0 overflow-hidden gradient-primary px-5 pb-5 pt-5 text-white">
          <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/5" />
          <div className="absolute -bottom-12 left-10 h-24 w-24 rounded-full bg-white/5" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Plane className="h-[18px] w-[18px]" />
              </div>
              <div>
                <h2 className="text-[17px] font-bold leading-tight">Как работают отпуска</h2>
                <p className="mt-0.5 text-[12.5px] text-white/70">От заявки до согласования и переноса — по шагам</p>
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

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain p-4 space-y-2.5">
          <Section id="create" icon={FilePlus2} title="Создание заявления на отпуск" accent="primary" open={openSections.has('create')} onToggle={toggleSection}>
            {videoFor('vacation-create')}
            <Timeline steps={createSteps} accent="primary" />
          </Section>

          <Section id="approve" icon={UserCheck2} title="Согласование заявки" accent="amber" open={openSections.has('approve')} onToggle={toggleSection}>
            {isManager && videoFor('vacation-approve')}
            <Timeline steps={approveSteps} accent="amber" />
          </Section>

          <Section id="transfer" icon={ArrowLeftRight} title="Перенос отпуска" accent="violet" open={openSections.has('transfer')} onToggle={toggleSection}>
            {videoFor('vacation-transfer')}
            <Timeline steps={transferSteps} accent="violet" />
          </Section>

          {isManager && (
            <Section id="restrictions" icon={ShieldAlert} title="Пересечения отпусков" accent="amber" open={openSections.has('restrictions')} onToggle={toggleSection}>
              {videoFor('vacation-restrictions')}
              <Timeline steps={restrictionSteps} accent="amber" />
            </Section>
          )}

          <div className="rounded-xl border border-dashed border-border p-4">
            <p className="mb-3 text-[13px] font-semibold text-muted-foreground">Что есть в этом разделе</p>
            <ul className="space-y-2.5">
              {features.map(({ icon: FIcon, text }, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  <FIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                  <span className="text-muted-foreground">{text}</span>
                </li>
              ))}
            </ul>
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
