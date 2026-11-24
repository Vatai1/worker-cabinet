import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export interface SelectDropdownOption {
  value: string
  label: string
  shortLabel?: string
  disabled?: boolean
}

const selectClass = 'h-9 border border-border rounded-[10px] bg-card text-[13px] text-foreground px-3 py-2 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15'

function floatingPosition(rect: DOMRect): CSSProperties {
  const width = Math.min(Math.max(240, rect.width), window.innerWidth - 24)
  const above = rect.top - 18
  const below = window.innerHeight - rect.bottom - 18
  const opensUp = below < 288 && above > below
  return {
    left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
    width,
    maxHeight: Math.min(288, opensUp ? above : below),
    ...(opensUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
  }
}

export function SelectDropdown({
  options,
  value,
  onChange,
  className,
  placeholder = '',
  disabled = false,
  floating = false,
  'aria-label': ariaLabel,
}: {
  options: SelectDropdownOption[]
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
  floating?: boolean
  'aria-label'?: string
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [position, setPosition] = useState<CSSProperties>()
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const open = activeIndex !== null && !disabled
  const selected = options.find(option => option.value === value)
  const label = selected?.shortLabel ?? selected?.label ?? placeholder

  useEffect(() => {
    if (!open) return
    const close = () => setActiveIndex(null)
    const handleOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!containerRef.current?.contains(target) && !listRef.current?.contains(target)) close()
    }
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (rect && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth) {
        setPosition(floatingPosition(rect))
      } else {
        close()
      }
    }
    const handleScroll = (event: Event) => {
      if (!(event.target instanceof Node && listRef.current?.contains(event.target))) updatePosition()
    }
    document.addEventListener('pointerdown', handleOutside)
    if (floating) {
      window.addEventListener('scroll', handleScroll, true)
      window.addEventListener('resize', updatePosition)
    }
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [floating, open])

  useEffect(() => {
    if (disabled) setActiveIndex(null)
  }, [disabled])

  useEffect(() => {
    if (open && activeIndex !== null) {
      const list = listRef.current
      const option = list?.children[activeIndex] as HTMLElement | undefined
      if (list && option) {
        const offset = option.offsetTop
        if (offset < list.scrollTop) list.scrollTop = offset
        else if (offset + option.offsetHeight > list.scrollTop + list.clientHeight) {
          list.scrollTop = offset + option.offsetHeight - list.clientHeight
        }
      }
    }
  }, [activeIndex, open])

  const enabledIndices = options.flatMap((option, index) => option.disabled ? [] : [index])
  const firstIndex = enabledIndices[0]
  const lastIndex = enabledIndices[enabledIndices.length - 1]

  function openList(reverse = false) {
    const index = options.findIndex(option => option.value === value && !option.disabled)
    const nextIndex = index === -1 ? (reverse ? lastIndex : firstIndex) : index
    if (nextIndex === undefined) return
    if (floating && triggerRef.current) {
      setPosition(floatingPosition(triggerRef.current.getBoundingClientRect()))
    }
    setActiveIndex(nextIndex)
  }

  function select(index: number) {
    const option = options[index]
    if (option && !option.disabled) onChange(option.value)
    setActiveIndex(null)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setActiveIndex(null)
    } else if (event.key === 'Tab') {
      setActiveIndex(null)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const forward = event.key === 'ArrowDown'
      if (!open) openList(!forward)
      else {
        const current = enabledIndices.indexOf(activeIndex)
        const next = Math.max(0, Math.min(enabledIndices.length - 1, current + (forward ? 1 : -1)))
        setActiveIndex(enabledIndices[next] ?? null)
      }
    } else if (open && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault()
      setActiveIndex((event.key === 'Home' ? firstIndex : lastIndex) ?? null)
    } else if (open && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      select(activeIndex)
    }
  }

  const list = open && (
    <div
      id={listId}
      role="listbox"
      aria-label={ariaLabel}
      ref={listRef}
      style={floating ? position : undefined}
      className={cn(
        'max-h-72 overflow-y-auto overscroll-contain rounded-[10px] border border-border bg-card p-1.5 text-foreground shadow-lg',
        floating ? 'fixed z-[70]' : 'absolute z-20 mt-1.5 w-max min-w-full max-w-[min(420px,calc(100vw-2rem))] sm:min-w-[15rem]',
      )}
    >
      {options.map((option, index) => (
        <button
          id={`${listId}-${index}`}
          key={option.value}
          type="button"
          role="option"
          aria-selected={option.value === value}
          disabled={option.disabled}
          tabIndex={-1}
          onMouseDown={event => event.preventDefault()}
          onClick={() => select(index)}
          className={cn(
            'flex w-full items-center justify-between gap-2 whitespace-normal break-words rounded-lg px-2.5 py-1.5 text-left text-[13px] leading-snug hover:bg-muted disabled:pointer-events-none disabled:opacity-50',
            option.value === value && 'font-semibold text-primary',
            index === activeIndex && 'bg-muted',
          )}
        >
          <span className="min-w-0">{option.label}</span>
          {option.value === value && <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
        </button>
      ))}
    </div>
  )

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        disabled={disabled || !enabledIndices.length}
        onClick={() => { if (open) setActiveIndex(null); else openList() }}
        onKeyDown={handleKeyDown}
        title={selected?.label ?? label}
        className={cn(selectClass, 'flex min-w-[140px] cursor-pointer items-center justify-between gap-2 text-left transition-colors hover:border-primary/40 disabled:cursor-default disabled:opacity-50', className)}
      >
        <span className="truncate">{label}</span>
        <ChevronDown aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {floating && open ? createPortal(list, document.body) : list}
    </div>
  )
}
