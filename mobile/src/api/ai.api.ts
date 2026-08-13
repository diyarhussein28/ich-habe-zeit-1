import { apiClient } from './client'

export interface RequestDraft {
  title: string
  description: string
  suggestedBudgetMin?: number
  suggestedBudgetMax?: number
  tips: string[]
}

export interface PriceSuggestion {
  min: number | null
  max: number | null
  reasoning: string
}

export interface AssistantTurn {
  role: 'user' | 'assistant'
  content: string
}

export const aiApi = {
  status: () => apiClient.get<{ available: boolean }>('/api/ai/status'),

  draftRequest: (rough: string, categoryName?: string, city?: string) =>
    apiClient.post<{ draft: RequestDraft }>('/api/ai/draft-request', { rough, categoryName, city }),

  ask: (question: string, history?: AssistantTurn[]) =>
    apiClient.post<{ answer: string }>('/api/ai/ask', { question, history }),

  suggestPrice: (requestTitle: string, requestDescription: string, categoryName?: string) =>
    apiClient.post<{ suggestion: PriceSuggestion }>('/api/ai/suggest-price', {
      requestTitle,
      requestDescription,
      categoryName,
    }),
}
