'use client'

import type { Dispatch } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { ProgramContent } from '@/lib/content-schema'
import type { DraftAction } from '@/lib/draft-reducer'
import type { Issue } from '@/lib/validate'
import { FieldError, isInvalid } from './FieldError'

export function PricingTab({ draft, issues, dispatch }: { draft: ProgramContent; issues: Issue[]; dispatch: Dispatch<DraftAction> }) {
  return (
    <div className="stack">
      <p className="callout" role="note">
        <TriangleAlert size={17} aria-hidden />
        <span>
          Changing an amount here does <b>not</b> change the Paystack payment page. Update the matching Paystack page too, or
          learners will be charged the old price.
        </span>
      </p>
      <label className="field">
        <span>Hero price label</span>
        <small>Shown under the program title on its page.</small>
        <input className="inp" value={draft.heroPriceLabel} aria-invalid={isInvalid(issues, 'heroPriceLabel')}
          onChange={(e) => dispatch({ type: 'heroPriceLabel', value: e.target.value })} />
        <FieldError issues={issues} path="heroPriceLabel" />
      </label>
      <FieldError issues={issues} path="pricing" />
      {draft.pricing.map((option, index) => {
        const at = (field: string) => `pricing.${index}.${field}`
        return (
          <fieldset key={option.id} className="price-card">
            <legend>{option.title || option.id}</legend>
            <label className="field">
              <span>Title</span>
              <input className="inp" value={option.title} aria-invalid={isInvalid(issues, at('title'))}
                onChange={(e) => dispatch({ type: 'pricing/text', index, field: 'title', value: e.target.value })} />
              <FieldError issues={issues} path={at('title')} />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Price label</span>
                <small>Exactly as shown, e.g. “2 × ₦87,500”</small>
                <input className="inp" value={option.priceLabel} aria-invalid={isInvalid(issues, at('priceLabel'))}
                  onChange={(e) => dispatch({ type: 'pricing/text', index, field: 'priceLabel', value: e.target.value })} />
                <FieldError issues={issues} path={at('priceLabel')} />
              </label>
              <label className="field">
                <span>Amount (₦)</span>
                <small>{option.id === 'full' ? 'Total fee. Also used to track installment balances.' : 'Amount per payment.'}</small>
                <input className="inp" type="number" min={1} step={1} inputMode="numeric"
                  value={Number.isNaN(option.amount) ? '' : option.amount} aria-invalid={isInvalid(issues, at('amount'))}
                  onChange={(e) => dispatch({ type: 'pricing/amount', index, value: e.target.valueAsNumber })} />
                <FieldError issues={issues} path={at('amount')} />
              </label>
            </div>
            <label className="field">
              <span>Description</span>
              <textarea className="inp" rows={2} value={option.description} aria-invalid={isInvalid(issues, at('description'))}
                onChange={(e) => dispatch({ type: 'pricing/text', index, field: 'description', value: e.target.value })} />
              <FieldError issues={issues} path={at('description')} />
            </label>
          </fieldset>
        )
      })}
    </div>
  )
}
