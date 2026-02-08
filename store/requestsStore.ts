import { create } from 'zustand'
import type { Request } from '@/types'

interface RequestsStore {
  requests: Request[]
  addRequest: (request: Omit<Request, 'id' | 'createdAt' | 'status'>) => void
  updateRequestStatus: (id: string, status: Request['status'], reviewerComment?: string) => void
  cancelRequest: (id: string) => void
  getRequestsByUserId: (userId: string) => Request[]
  getPendingRequests: () => Request[]
}

// Initial mock requests
const initialRequests: Request[] = [
  {
    id: '1',
    userId: '1',
    type: 'vacation',
    startDate: '2025-01-15',
    endDate: '2025-01-29',
    reason: 'Ежегодный оплачиваемый отпуск',
    status: 'approved',
    createdAt: '2024-12-01T10:00:00',
    reviewedAt: '2024-12-05T14:30:00',
  },
  {
    id: '2',
    userId: '1',
    type: 'remote_work',
    startDate: '2025-01-08',
    endDate: '2025-01-08',
    reason: 'Работа на дому по семейным обстоятельствам',
    status: 'approved',
    createdAt: '2025-01-05T09:00:00',
    reviewedAt: '2025-01-05T11:30:00',
  },
]

export const useRequestsStore = create<RequestsStore>((set, get) => ({
  requests: initialRequests,
  
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
  
  getRequestsByUserId: (userId) => {
    return get().requests.filter((req) => req.userId === userId)
  },
  
  getPendingRequests: () => {
    return get().requests.filter((req) => req.status === 'pending')
  },
}))
