import { create } from 'zustand'
import { readLocalPref, writeLocalPref } from '@/shared/lib/localPrefs'

const SHOW_TAGS_KEY = 'hierarchyShowTags'

interface HierarchyViewState {
  showTags: boolean
  setShowTags: (value: boolean) => void
}

export const useHierarchyViewStore = create<HierarchyViewState>((set) => ({
  showTags: readLocalPref(SHOW_TAGS_KEY) !== '0',
  setShowTags: (value) => {
    writeLocalPref(SHOW_TAGS_KEY, value ? '1' : '0')
    set({ showTags: value })
  },
}))
