import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { AriaAttributes, CSSProperties, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { SELECT_TRIGGER_CLASS } from '@/shared/lib/selectStyles'

export interface SelectOption {
  value: string
  label: string
  shortLabel?: string
  disabled?: boolean
  title?: string
  group?: string
}

interface Props extends AriaAttributes {
  options: SelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  label: string
  placeholder?: boolean
  multiple?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  clearLabel?: string
  disabled?: boolean
  id?: string
  className?: string
  variant?: 'default' | 'cell'
}

export function SelectControl({ options, selected, onChange, label, placeholder, multiple = false, searchable = false, searchPlaceholder = 'Поиск…', clearLabel, disabled = false, id, className, variant = 'default', ...ariaProps }: Props) {
  const generatedId = useId()
  const controlId = id || generatedId
  const listId = `${controlId}-options`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' })
  const typeahead = useRef({ text: '', time: 0 })
  const filtered = options.filter(option => !search.trim() || option.label.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')))
  const items: (SelectOption & { clear: boolean })[] = clearLabel ? [{ value: '', label: clearLabel, clear: true }, ...filtered.map(option => ({ ...option, clear: false }))] : filtered.map(option => ({ ...option, clear: false }))
  const activeId = items[activeIndex] ? `${listId}-${activeIndex}` : undefined

  const close = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  const show = (last = false) => {
    if (disabled) return
    setSearch('')
    const allItems = clearLabel ? [{ value: '', disabled: false }, ...options] : options
    const chosen = allItems.findIndex(option => selected.includes(option.value) && !option.disabled)
    const firstEnabled = allItems.findIndex(option => !option.disabled)
    const lastEnabled = allItems.reduce((lastIndex, option, index) => option.disabled ? lastIndex : index, -1)
    setActiveIndex(last ? Math.max(0, lastEnabled) : chosen >= 0 ? chosen : Math.max(0, firstEnabled))
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open || disabled) return
    const updatePosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      let zIndex = 200
      let ancestor: HTMLElement | null = trigger
      while (ancestor) {
        const layer = Number.parseInt(window.getComputedStyle(ancestor).zIndex, 10)
        if (Number.isFinite(layer)) zIndex = Math.max(zIndex, layer + 1)
        ancestor = ancestor.parentElement
      }
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth
      const below = viewportHeight - rect.bottom - 12
      const above = rect.top - 12
      const upwards = below < 220 && above > below
      const maxHeight = Math.max(0, Math.min(360, upwards ? above : below))
      const width = Math.min(Math.max(rect.width, 240), viewportWidth - 24)
      setPosition({ position: 'fixed', zIndex, left: Math.max(12, Math.min(rect.left, viewportWidth - width - 12)), width, maxHeight, ...(upwards ? { bottom: viewportHeight - rect.top + 6 } : { top: rect.bottom + 6 }) })
    }
    updatePosition()
    if (searchable) searchRef.current?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node) && !popupRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    const onScroll = (event: Event) => {
      if (!popupRef.current?.contains(event.target as Node)) updatePosition()
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape, true)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', onScroll, true)
    window.visualViewport?.addEventListener('resize', updatePosition)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape, true)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', onScroll, true)
      window.visualViewport?.removeEventListener('resize', updatePosition)
    }
  }, [open, disabled, searchable])

  useLayoutEffect(() => {
    if (!open || disabled || position.maxHeight === undefined) return
    const list = document.getElementById(listId)
    const option = document.getElementById(`${listId}-${activeIndex}`)
    if (!list || !option) return

    const top = list.getBoundingClientRect().top + list.clientTop
    const bottom = top + list.clientHeight
    const optionRect = option.getBoundingClientRect()
    if (optionRect.top < top) list.scrollTop += Math.floor(optionRect.top - top)
    else if (optionRect.bottom > bottom) list.scrollTop += Math.ceil(optionRect.bottom - bottom)
  }, [open, disabled, activeIndex, listId, position.maxHeight])

  const choose = (index: number) => {
    const option = items[index]
    if (!option || option.disabled) return
    if (option.clear) onChange([])
    else if (multiple) onChange(selected.includes(option.value) ? selected.filter(value => value !== option.value) : [...selected, option.value])
    else onChange([option.value])
    if (!multiple) close(true)
  }

  const handleKeydown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Tab') {
      if (open && searchable) {
        event.preventDefault()
        event.stopPropagation()
        const trigger = triggerRef.current
        const scope = trigger?.closest('[role="dialog"], [aria-modal="true"]') || document.body
        const controls = Array.from(scope.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, [tabindex]')).filter(element => {
          const style = window.getComputedStyle(element)
          return element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[hidden], [inert]') && !popupRef.current?.contains(element) && style.display !== 'none' && style.visibility !== 'hidden'
        })
        const current = controls.indexOf(trigger!)
        const next = controls[(current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]
        close()
        next?.focus()
      } else close()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) { show(event.key === 'ArrowUp'); return }
      const direction = event.key === 'ArrowDown' ? 1 : -1
      for (let step = 1; step <= items.length; step++) {
        const index = (activeIndex + direction * step + items.length) % items.length
        if (!items[index].disabled) { setActiveIndex(index); break }
      }
    } else if (open && (event.key === 'Home' || event.key === 'End') && event.target !== searchRef.current) {
      event.preventDefault()
      const indices = items.map((_, index) => index)
      if (event.key === 'End') indices.reverse()
      setActiveIndex(indices.find(index => !items[index].disabled) ?? 0)
    } else if (event.key === 'Enter' || (event.key === ' ' && event.target !== searchRef.current)) {
      event.preventDefault()
      if (open) choose(activeIndex)
      else show()
    } else if (event.key.length === 1 && event.target !== searchRef.current && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      if (!open) show()
      const now = Date.now()
      const query = (now - typeahead.current.time < 700 ? typeahead.current.text : '') + event.key.toLocaleLowerCase('ru')
      typeahead.current = { text: query, time: now }
      const index = items.findIndex(option => !option.disabled && option.label.toLocaleLowerCase('ru').startsWith(query))
      if (index >= 0) setActiveIndex(index)
    }
  }

  const expanded = open && !disabled
  return (
    <>
      <button
        {...ariaProps}
        ref={triggerRef}
        id={controlId}
        type="button"
        role="combobox"
        data-value={multiple ? undefined : selected[0] ?? ''}
        aria-label={ariaProps['aria-label'] || (!id && !ariaProps['aria-labelledby'] ? label : undefined)}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && !searchable ? activeId : undefined}
        disabled={disabled}
        title={label}
        onClick={() => expanded ? close() : show()}
        onKeyDown={handleKeydown}
        className={cn(
          SELECT_TRIGGER_CLASS,
          expanded && 'border-primary/50 ring-2 ring-primary/15',
          placeholder && 'font-normal text-muted-foreground',
          variant === 'cell' && 'h-9 w-full justify-center gap-1 rounded-md border-transparent bg-transparent px-1 py-1 text-center text-xs shadow-none hover:bg-primary/10',
          className
        )}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown aria-hidden="true" className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none', expanded && 'rotate-180', variant === 'cell' && 'h-3 w-3')} />
      </button>
      {expanded && createPortal(
        <div
          ref={popupRef}
          data-select-popup=""
          style={position}
          onClick={event => event.stopPropagation()}
          onPointerDown={event => event.stopPropagation()}
          onKeyDown={handleKeydown}
          className="z-[200] flex flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl shadow-black/10"
        >
          {searchable && (
            <div className="relative shrink-0 border-b border-border/60 p-2">
              <Search aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                role="combobox"
                aria-label={searchPlaceholder}
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={activeId}
                aria-autocomplete="list"
                value={search}
                onChange={event => {
                  setSearch(event.target.value)
                  setActiveIndex(clearLabel ? 0 : Math.max(0, options.filter(option => option.label.toLocaleLowerCase('ru').includes(event.target.value.trim().toLocaleLowerCase('ru'))).findIndex(option => !option.disabled)))
                }}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-lg border border-transparent bg-muted/50 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
              />
            </div>
          )}
          <div id={listId} role="listbox" aria-label={ariaProps['aria-label'] || label} aria-multiselectable={multiple || undefined} className="scrollbar-thin min-h-0 overflow-y-auto overscroll-contain p-1.5">
            {items.length === 0 && <p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">Ничего не найдено</p>}
            {items.map((option, index) => {
              const checked = option.clear ? selected.length === 0 : selected.includes(option.value)
              return (
                <div key={option.clear ? 'clear' : option.value}>
                  {option.group && option.group !== items[index - 1]?.group && <p className="px-3 pb-1 pt-2 text-xs font-semibold text-muted-foreground">{option.group}</p>}
                  <div
                    id={`${listId}-${index}`}
                    role="option"
                    data-value={option.value}
                    aria-selected={checked}
                    aria-disabled={option.disabled || undefined}
                    title={option.title}
                    onMouseDown={event => event.preventDefault()}
                    onMouseMove={() => { if (!option.disabled && activeIndex !== index) setActiveIndex(index) }}
                    onClick={() => choose(index)}
                    className={cn(
                      'flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm leading-snug transition-colors motion-reduce:transition-none',
                      checked && 'bg-primary/5 font-medium text-primary',
                      activeIndex === index && !option.disabled && 'bg-muted',
                      option.disabled && 'cursor-not-allowed text-muted-foreground opacity-50',
                      option.clear && 'mb-1 border-b border-border/60 text-muted-foreground'
                    )}
                  >
                    {multiple && <span aria-hidden="true" className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input', checked && 'border-primary bg-primary text-primary-foreground')}>{checked && <Check className="h-3 w-3" />}</span>}
                    <span className="min-w-0 flex-1 whitespace-normal break-words">{option.label}</span>
                    {!multiple && <Check aria-hidden="true" className={cn('h-4 w-4 shrink-0 text-primary', !checked && 'invisible')} />}
                  </div>
                </div>
              )
            })}
          </div>
          {multiple && <div aria-live="polite" className="shrink-0 border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">Выбрано: {selected.length}</div>}
        </div>, document.body
      )}
    </>
  )
}
