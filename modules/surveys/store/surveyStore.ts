import { create } from 'zustand'
import { surveyApi } from '@/modules/surveys/services/surveyApi'
import { getErrorMessage } from '@/shared/lib/utils'
import type { Survey } from '@/shared/types'

interface SurveyStore {
  surveys: Survey[]
  loading: boolean
  error: string | null
  fetchSurveys: () => Promise<void>
  publishSurvey: (id: string) => Promise<void>
  closeSurvey: (id: string) => Promise<void>
  removeSurvey: (id: string) => Promise<void>
}

export const useSurveyStore = create<SurveyStore>()((set) => ({
  surveys: [],
  loading: false,
  error: null,

  fetchSurveys: async () => {
    set({ loading: true, error: null })
    try {
      const surveys = await surveyApi.list()
      set({ surveys, loading: false })
    } catch (err: unknown) {
      set({ error: getErrorMessage(err), loading: false })
    }
  },

  publishSurvey: async (id) => {
    try {
      const updated = await surveyApi.publish(id)
      set((s) => ({ surveys: s.surveys.map((sv) => (sv.id === id ? { ...sv, ...updated } : sv)) }))
    } catch (err: unknown) {
      set({ error: getErrorMessage(err) })
      throw err
    }
  },

  closeSurvey: async (id) => {
    try {
      const updated = await surveyApi.close(id)
      set((s) => ({ surveys: s.surveys.map((sv) => (sv.id === id ? { ...sv, ...updated } : sv)) }))
    } catch (err: unknown) {
      set({ error: getErrorMessage(err) })
      throw err
    }
  },

  removeSurvey: async (id) => {
    try {
      await surveyApi.remove(id)
      set((s) => ({ surveys: s.surveys.filter((sv) => sv.id !== id) }))
    } catch (err: unknown) {
      set({ error: getErrorMessage(err) })
      throw err
    }
  },
}))
