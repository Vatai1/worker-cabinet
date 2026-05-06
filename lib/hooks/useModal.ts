import { useState, useCallback } from 'react'

interface ModalState {
  isOpen: boolean
  data: any
}

export function useModal<T = any>(initialData?: T) {
  const [state, setState] = useState<ModalState>({
    isOpen: false,
    data: initialData,
  })

  const open = useCallback((data?: any) => {
    setState({
      isOpen: true,
      data,
    })
  }, [])

  const close = useCallback(() => {
    setState({
      isOpen: false,
      data: null,
    })
  }, [])

  const setData = useCallback((data: any) => {
    setState(prev => ({
        ...prev,
        data,
    }))
  }, [])

  return {
    isOpen: state.isOpen,
    data: state.data,
    open,
    close,
    setData,
  }
}
