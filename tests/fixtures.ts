import type { Cohort, Content, ProgramContent } from '@/lib/content-schema'

/** Fixed "today" for every date-sensitive test: 14 Oct 2026, midday UTC. */
export const NOW = new Date('2026-10-14T12:00:00Z')

export function cohort(over: Partial<Cohort> = {}): Cohort {
  return {
    id: 'cohort-2027-q1',
    name: 'Q1 2027 Cohort',
    startDate: '2027-01-23',
    endDate: '2027-03-21',
    format: 'hybrid',
    seatsRemaining: 20,
    totalSeats: 50,
    ...over,
  }
}

export function program(over: Partial<ProgramContent> = {}): ProgramContent {
  return {
    cohorts: [cohort()],
    pricing: [
      {
        id: 'full',
        title: 'Pay in full',
        priceLabel: '₦175,000',
        amount: 175000,
        description: 'Single payment due on enrollment confirmation.',
        highlights: ['Lowest total cost'],
        recommended: true,
      },
      {
        id: 'installments',
        title: '2 installments',
        priceLabel: '2 × ₦87,500',
        amount: 87500,
        description: 'First installment on enrollment, second due by end of weekend 4.',
        highlights: ['Lower upfront cost'],
      },
    ],
    heroPriceLabel: '₦175,000 · or 2 installments of ₦87,500',
    landingImageUrl: 'https://store.public.blob.vercel-storage.com/images/school-of-finance-0123456789abcdef.jpg',
    ...over,
  }
}

export function content(over: Partial<Content> = {}): Content {
  return {
    version: 1,
    updatedAt: '2026-10-14T10:00:00.000Z',
    updatedBy: 'seed',
    programs: { 'school-of-finance': program() },
    ...over,
  }
}
