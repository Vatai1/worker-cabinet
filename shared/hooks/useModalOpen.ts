import { useEffect } from 'react'
import { useUIStore } from '@/shared/store/uiStore'

export function useModalOpen(isOpen: boolean) {
  const openModal = useUIStore((s) => s.openModal)
  const closeModal = useUIStore((s) => s.closeModal)

  useEffect(() => {
    if (isOpen) {
      openModal()
      return () => closeModal()
    }
  }, [isOpen, openModal, closeModal])
}
