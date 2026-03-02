import { useEffect, useRef, useState } from 'react'
import { User, Briefcase } from 'lucide-react'

interface Props {
  x: number
  y: number
  onClose: () => void
  onViewProfile: () => void
  onViewRole: () => void
}

export function ContextMenu({ x, y, onClose, onViewProfile, onViewRole }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] bg-background rounded-lg shadow-2xl border border-border/50 py-1 animate-in fade-in zoom-in duration-100"
      style={{ left: x, top: y }}
    >
      <button
        onClick={() => { onViewProfile(); onClose() }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <User className="h-4 w-4" />
        Показать профиль
      </button>
      <button
        onClick={() => { onViewRole(); onClose() }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Briefcase className="h-4 w-4" />
        Показать роль в проекте
      </button>
    </div>
  )
}
