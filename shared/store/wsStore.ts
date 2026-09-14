import { create } from 'zustand'

interface VacationEvent {
  n: number
  organizationId?: number
  actorId?: number
}

interface WsStore {
  vacationEvents: VacationEvent
  bumpVacationEvents: (data: { organizationId?: number; actorId?: number }) => void
}

export const useWsStore = create<WsStore>((set) => ({
  vacationEvents: { n: 0 },
  bumpVacationEvents: (data) => set((state) => ({
    vacationEvents: { n: state.vacationEvents.n + 1, organizationId: data.organizationId, actorId: data.actorId },
  })),
}))
