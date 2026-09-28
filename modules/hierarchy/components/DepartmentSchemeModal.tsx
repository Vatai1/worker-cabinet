import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { apiGet } from '@/shared/lib/apiClient'
import { getErrorMessage } from '@/shared/lib/utils'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { DepartmentHierarchyOverlay } from '@/modules/hierarchy/components/DepartmentHierarchyOverlay'
import type { Department } from '@/modules/hierarchy/pages/HRHierarchy'

export function DepartmentSchemeModal({ departmentId, departmentName, onClose }: { departmentId: number; departmentName: string; onClose: () => void }) {
  const [departments, setDepartments] = useState<Department[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useModalOpen(true)

  useEffect(() => {
    apiGet<Department[]>('/departments')
      .then(setDepartments)
      .catch((err) => setError(getErrorMessage(err)))
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-card">
      <div className="relative h-full w-full">
        {departments ? (
          <DepartmentHierarchyOverlay
            departmentId={departmentId}
            departmentName={departmentName}
            departments={departments}
            onClose={onClose}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            {error ? (
              <>
                <span className="text-destructive">{error}</span>
                <button onClick={onClose} className="underline">Закрыть</button>
              </>
            ) : (
              <Loader2 className="h-6 w-6 animate-spin" />
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
