// Branching intake questionnaire for opening a dispute, modeled on how
// Fiverr/Upwork resolution centers work: pick a category, answer a couple of
// guided follow-ups, and only require photo/document evidence when the
// situation is inherently visual/factual (damage, quality, completion state)
// rather than always demanding free text.

export interface DisputeQuestionOption {
  value: string
  label: string
  forcesEvidence?: boolean
  next?: DisputeQuestionNode
}

export interface DisputeQuestionNode {
  key: string
  question: string
  options: DisputeQuestionOption[]
}

export interface DisputeCategoryConfig {
  value: string
  label: string
  firstQuestion?: DisputeQuestionNode
  evidenceRequiredByDefault: boolean
}

export interface DisputeAnswer {
  key: string
  question: string
  answer: string
}

const CUSTOMER_CATEGORIES: DisputeCategoryConfig[] = [
  {
    value: 'NOT_COMPLETED',
    label: 'Der Auftrag wurde nicht abgeschlossen',
    evidenceRequiredByDefault: false,
    firstQuestion: {
      key: 'provider_showed_up',
      question: 'Ist der Dienstleister zum vereinbarten Termin erschienen?',
      options: [
        {
          value: 'YES_NOT_FINISHED',
          label: 'Ja, aber nicht fertig geworden',
          next: {
            key: 'completion_amount',
            question: 'Wie viel wurde erledigt?',
            options: [
              { value: 'NOTHING', label: 'Nichts', forcesEvidence: true },
              { value: 'SMALL_PART', label: 'Nur ein kleiner Teil', forcesEvidence: true },
              { value: 'MOST', label: 'Fast alles', forcesEvidence: true },
            ],
          },
        },
        { value: 'NO_SHOW', label: 'Nein, er ist nicht erschienen' },
      ],
    },
  },
  {
    value: 'NOT_AS_AGREED',
    label: 'Die Arbeit entspricht nicht der Vereinbarung',
    evidenceRequiredByDefault: false,
    firstQuestion: {
      key: 'what_is_wrong',
      question: 'Was genau stimmt nicht?',
      options: [
        { value: 'QUALITY', label: 'Qualität ist mangelhaft', forcesEvidence: true },
        { value: 'WRONG_SERVICE', label: 'Andere Leistung als vereinbart erbracht', forcesEvidence: true },
        { value: 'PARTIAL', label: 'Nur teilweise erledigt', forcesEvidence: true },
        { value: 'OTHER', label: 'Sonstiges' },
      ],
    },
  },
  {
    value: 'DAMAGE',
    label: 'Es ist ein Schaden entstanden',
    evidenceRequiredByDefault: true,
  },
  {
    value: 'NO_SHOW',
    label: 'Der Dienstleister ist nicht erschienen',
    evidenceRequiredByDefault: false,
    firstQuestion: {
      key: 'had_fixed_appointment',
      question: 'Hattet ihr einen festen Termin vereinbart?',
      options: [
        { value: 'YES', label: 'Ja' },
        { value: 'NO', label: 'Nein, es war noch offen' },
      ],
    },
  },
  {
    value: 'PAYMENT_ISSUE',
    label: 'Zahlungsproblem',
    evidenceRequiredByDefault: false,
  },
  {
    value: 'OTHER',
    label: 'Sonstiges',
    evidenceRequiredByDefault: false,
  },
]

const PROVIDER_CATEGORIES: DisputeCategoryConfig[] = [
  {
    value: 'COULD_NOT_COMPLETE',
    label: 'Ich konnte den Auftrag nicht abschließen',
    evidenceRequiredByDefault: false,
    firstQuestion: {
      key: 'had_started',
      question: 'Hast du mit der Arbeit begonnen?',
      options: [
        {
          value: 'YES',
          label: 'Ja',
          next: {
            key: 'progress',
            question: 'Wie weit bist du gekommen?',
            options: [
              { value: 'ALMOST_DONE', label: 'Fast fertig', forcesEvidence: true },
              { value: 'HALFWAY', label: 'Zur Hälfte', forcesEvidence: true },
              { value: 'JUST_STARTED', label: 'Gerade erst begonnen', forcesEvidence: true },
            ],
          },
        },
        {
          value: 'NO',
          label: 'Nein',
          next: {
            key: 'why_not_started',
            question: 'Warum konntest du nicht beginnen?',
            options: [
              { value: 'ACCESS_DENIED', label: 'Zugang wurde verweigert', forcesEvidence: true },
              { value: 'CUSTOMER_UNREACHABLE', label: 'Auftraggeber vor Ort nicht erreichbar' },
              { value: 'SAFETY_CONCERN', label: 'Sicherheitsbedenken vor Ort', forcesEvidence: true },
              { value: 'OTHER', label: 'Sonstiges' },
            ],
          },
        },
      ],
    },
  },
  {
    value: 'CUSTOMER_UNRESPONSIVE',
    label: 'Der Auftraggeber reagiert nicht mehr',
    evidenceRequiredByDefault: false,
    firstQuestion: {
      key: 'no_response_since',
      question: 'Seit wann hast du keine Antwort erhalten?',
      options: [
        { value: 'LESS_24H', label: 'Weniger als 24 Stunden' },
        { value: '1_3_DAYS', label: '1–3 Tage' },
        { value: 'MORE_3_DAYS', label: 'Mehr als 3 Tage' },
      ],
    },
  },
  {
    value: 'SCOPE_DISPUTE',
    label: 'Der Auftraggeber verlangt mehr als vereinbart',
    evidenceRequiredByDefault: false,
  },
  {
    value: 'UNFAIR_CANCELLATION',
    label: 'Der Auftraggeber möchte ohne triftigen Grund stornieren',
    evidenceRequiredByDefault: false,
    firstQuestion: {
      key: 'reason_given',
      question: 'Hat der Auftraggeber einen Grund genannt?',
      options: [
        { value: 'YES', label: 'Ja' },
        { value: 'NO', label: 'Nein' },
      ],
    },
  },
  {
    value: 'PAYMENT_ISSUE',
    label: 'Zahlungsproblem',
    evidenceRequiredByDefault: false,
  },
  {
    value: 'OTHER',
    label: 'Sonstiges',
    evidenceRequiredByDefault: false,
  },
]

export function getDisputeCategories(role: 'customer' | 'provider'): DisputeCategoryConfig[] {
  return role === 'customer' ? CUSTOMER_CATEGORIES : PROVIDER_CATEGORIES
}

export function findCategory(role: 'customer' | 'provider', value: string): DisputeCategoryConfig | undefined {
  return getDisputeCategories(role).find((c) => c.value === value)
}
