type SurveyStatus = 'draft' | 'active' | 'closed'
type SurveyTargetType = 'all' | 'department' | 'employees'
type QuestionType = 'radio' | 'checkbox' | 'text' | 'scale'

export interface SurveyQuestion {
  id?: string
  type: QuestionType
  text: string
  options: string[]
  scaleMin: number
  scaleMax: number
  required: boolean
  localId?: string
}

export interface Survey {
  id: string
  title: string
  description?: string
  createdBy: string
  targetType: SurveyTargetType
  targetIds: string[]
  deadline?: string
  anonymous: boolean
  status: SurveyStatus
  createdAt: string
  questionCount?: number
  responseCount?: number
  totalTargeted?: number
}

export interface SurveyWithQuestions extends Survey {
  questions: SurveyQuestion[]
}

export interface SurveyAnalytics {
  total_targeted: number
  total_responded: number
  questions: AnalyticsQuestion[]
}

type AnalyticsQuestion =
  | { id: number; text: string; type: 'radio' | 'checkbox'; options: { label: string; count: number; percent: number }[] }
  | { id: number; text: string; type: 'scale'; average: number | null; distribution: Record<string, number> }
  | { id: number; text: string; type: 'text'; answers: string[] }
