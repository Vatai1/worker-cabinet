import { useState, useCallback } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useAsync<T = any>(asyncFunction: () => Promise<T>) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  })

  const execute = useCallback(async () => {
    setState({ data: null, loading: true, error: null })
    try {
      const result = await asyncFunction()
      setState({ data: result, loading: false, error: null })
      return result
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      setState({ data: null, loading: false, error })
      throw err
    }
  }, [asyncFunction])

  return { ...state, execute }
}
