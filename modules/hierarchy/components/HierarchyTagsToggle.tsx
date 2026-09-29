import { Tag } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useHierarchyViewStore } from '@/modules/hierarchy/store/hierarchyViewStore'

export function HierarchyTagsToggle({ className }: { className?: string }) {
  const showTags = useHierarchyViewStore((s) => s.showTags)
  const setShowTags = useHierarchyViewStore((s) => s.setShowTags)
  return (
    <button
      type="button"
      onClick={() => setShowTags(!showTags)}
      aria-pressed={showTags}
      title={showTags ? 'Скрыть теги сотрудников' : 'Показать теги сотрудников'}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
        showTags ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
        className,
      )}
    >
      <Tag className="h-3.5 w-3.5" />
      Теги
    </button>
  )
}
