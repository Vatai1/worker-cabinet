import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string): string {
  if (typeof date === 'string' && !date.includes('T')) {
    // For YYYY-MM-DD format, parse as local date to avoid timezone shift
    const [year, month, day] = date.split('-').map(Number)
    const d = new Date(year, month - 1, day)
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d)
  }
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Произошла неизвестная ошибка'
}

export function personName(last?: string | null, first?: string | null, middle?: string | null): string {
  return [last, first, middle].map(part => part?.trim()).filter(Boolean).join(' ')
}

export function personNameShort(last?: string | null, first?: string | null, middle?: string | null): string {
  const l = last?.trim()
  if (!l) return personName(last, first, middle)
  const initials = [first, middle].map(part => part?.trim()?.[0]).filter(Boolean).map(ch => `${ch}.`).join('')
  return initials ? `${l} ${initials}` : l
}
