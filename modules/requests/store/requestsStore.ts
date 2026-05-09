import { create } from 'zustand'
import type { Request } from '@/shared/types'

interface RequestsStore {
  requests: Request[]
  addRequest: (request: Omit<Request, 'id' | 'createdAt' | 'status'>) => void
  updateRequestStatus: (id: string, status: Request['status'], reviewerComment?: string) => void
  cancelRequest: (id: string) => void
}

export const useRequestsStore = create<RequestsStore>((set) => ({
  requests: [],
  
  addRequest: (request) => {
    const newRequest: Request = {
      ...request,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      status: 'pending',
    }
    set((state) => ({ requests: [...state.requests, newRequest] }))
  },
  
  updateRequestStatus: (id, status, reviewerComment) => {
    set((state) => ({
      requests: state.requests.map((req) =>
        req.id === id
          ? {
              ...req,
              status,
              reviewerComment,
              reviewedAt: new Date().toISOString(),
            }
          : req
      ),
    }))
  },
  
  cancelRequest: (id) => {
    set((state) => ({
      requests: state.requests.map((req) =>
        req.id === id ? { ...req, status: 'cancelled' } : req
      ),
    }))
  },
  
}))
