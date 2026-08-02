import { apiClient } from './client'

export type InvoiceType = 'SERVICE_INVOICE' | 'COMMISSION_INVOICE'

export interface Invoice {
  id: string
  invoiceNumber: string
  invoiceType: InvoiceType
  orderId: string
  issuerId: string
  receiverId: string
  issueDate: string
  serviceDate: string
  subtotalAmount: number
  vatRate: number
  vatAmount: number
  totalAmount: number
  currency: string
  order: {
    id: string
    status: string
    grossAmount: number
    request: {
      category: { id: string; name: string } | null
    }
  }
}

export const invoicesApi = {
  list: () => apiClient.get<{ invoices: Invoice[] }>('/api/invoices'),
}
