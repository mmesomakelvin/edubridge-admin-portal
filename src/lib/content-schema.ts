import { z } from 'zod'

/**
 * Shape of content.json. The schema checks *types* only; business rules
 * (date order, seat bounds, friendly messages) live in validate.ts so that
 * staff get field-level messages instead of schema errors.
 */
export const COHORT_FORMATS = ['hybrid', 'virtual', 'in-person'] as const
export type CohortFormat = (typeof COHORT_FORMATS)[number]

export const CohortSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  format: z.enum(COHORT_FORMATS),
  seatsRemaining: z.number(),
  totalSeats: z.number(),
})

export const PricingOptionSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  priceLabel: z.string(),
  amount: z.number(),
  description: z.string(),
  highlights: z.array(z.string()),
  recommended: z.boolean().optional(),
})

export const ProgramContentSchema = z.object({
  cohorts: z.array(CohortSchema),
  pricing: z.array(PricingOptionSchema),
  heroPriceLabel: z.string(),
  landingImageUrl: z.string(),
})

export const ContentSchema = z.object({
  version: z.number().int().nonnegative(),
  updatedAt: z.string(),
  updatedBy: z.string(),
  programs: z.record(z.string(), ProgramContentSchema),
})

export type Cohort = z.infer<typeof CohortSchema>
export type PricingOption = z.infer<typeof PricingOptionSchema>
export type ProgramContent = z.infer<typeof ProgramContentSchema>
export type Content = z.infer<typeof ContentSchema>
