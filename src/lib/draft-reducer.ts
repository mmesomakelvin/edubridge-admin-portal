import { NEW_COHORT_PREFIX, suggestCohortName } from './cohort-ids'
import type { Cohort, CohortFormat, ProgramContent } from './content-schema'

export type DraftAction =
  | { type: 'cohort/add'; id: string }
  | { type: 'cohort/text'; index: number; field: 'name' | 'startDate' | 'endDate'; value: string }
  | { type: 'cohort/format'; index: number; value: CohortFormat }
  | { type: 'cohort/number'; index: number; field: 'seatsRemaining' | 'totalSeats'; value: number }
  | { type: 'cohort/remove'; index: number }
  | { type: 'pricing/text'; index: number; field: 'title' | 'priceLabel' | 'description'; value: string }
  | { type: 'pricing/amount'; index: number; value: number }
  | { type: 'heroPriceLabel'; value: string }
  | { type: 'image'; url: string }
  | { type: 'reset'; value: ProgramContent }

function replaceAt<T>(items: T[], index: number, update: (item: T) => T): T[] {
  return items.map((item, i) => (i === index ? update(item) : item))
}

function setCohortText(c: Cohort, field: 'name' | 'startDate' | 'endDate', value: string): Cohort {
  const next = { ...c, [field]: value }
  const autoNamed = c.name === '' || c.name === suggestCohortName(c.startDate)
  if (field === 'startDate' && c.id.startsWith(NEW_COHORT_PREFIX) && autoNamed) next.name = suggestCohortName(value)
  return next
}

export function draftReducer(state: ProgramContent, action: DraftAction): ProgramContent {
  switch (action.type) {
    case 'cohort/add': {
      const last = state.cohorts.at(-1)
      const seats = last && Number.isInteger(last.totalSeats) && last.totalSeats > 0 ? last.totalSeats : 20
      const blank: Cohort = { id: action.id, name: '', startDate: '', endDate: '', format: last?.format ?? 'hybrid', seatsRemaining: seats, totalSeats: seats }
      return { ...state, cohorts: [...state.cohorts, blank] }
    }
    case 'cohort/text':
      return { ...state, cohorts: replaceAt(state.cohorts, action.index, (c) => setCohortText(c, action.field, action.value)) }
    case 'cohort/format':
      return { ...state, cohorts: replaceAt(state.cohorts, action.index, (c) => ({ ...c, format: action.value })) }
    case 'cohort/number':
      return { ...state, cohorts: replaceAt(state.cohorts, action.index, (c) => ({ ...c, [action.field]: action.value })) }
    case 'cohort/remove':
      return { ...state, cohorts: state.cohorts.filter((_, i) => i !== action.index) }
    case 'pricing/text':
      return { ...state, pricing: replaceAt(state.pricing, action.index, (p) => ({ ...p, [action.field]: action.value })) }
    case 'pricing/amount':
      return { ...state, pricing: replaceAt(state.pricing, action.index, (p) => ({ ...p, amount: action.value })) }
    case 'heroPriceLabel':
      return { ...state, heroPriceLabel: action.value }
    case 'image':
      return { ...state, landingImageUrl: action.url }
    case 'reset':
      return action.value
  }
}
