import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PricingTab } from '@/components/editor/PricingTab'
import { confirmTitle, publishedNotice, reviewNotice } from '@/lib/public-site'
import { CONTENT_MAX_AGE_SECONDS } from '@/lib/store'
import { program } from './fixtures'

describe('publish wording before the website is connected', () => {
  it('says the confirmation goes to the portal', () => {
    expect(confirmTitle(1, false)).toBe('Publish 1 change to the portal?')
    expect(confirmTitle(3, false)).toBe('Publish 3 changes to the portal?')
  })

  it('warns that customers will not see the change', () => {
    expect(reviewNotice(false)).toBe(
      "This updates the portal only. The public website isn't connected yet, so customers won't see this change. You can roll back from Publish history.",
    )
  })

  it('confirms the publish without promising a website update', () => {
    expect(publishedNotice(4, false)).toBe("Published version 4 to the portal. The public website isn't connected yet, so customers won't see this change.")
  })
})

describe('publish wording once the website is connected', () => {
  it('names the live site', () => {
    expect(confirmTitle(2, true)).toBe('Publish 2 changes to the live site?')
  })

  it('promises the five-minute update', () => {
    expect(reviewNotice(true)).toBe('The public website updates within about 5 minutes. You can roll back from Publish history.')
    expect(publishedNotice(4, true)).toBe('Published version 4. The public website updates within about 5 minutes.')
  })
})

describe('Plan 2 portal settings', () => {
  it('caches the public content for five minutes', () => {
    expect(CONTENT_MAX_AGE_SECONDS).toBe(300)
  })

  it('no longer promises a one-minute update anywhere in the app', () => {
    const src = join(process.cwd(), 'src')
    const offenders = readdirSync(src, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => /about a minute/i.test(readFileSync(join(src, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})

describe('Pricing tab warning', () => {
  it('names everywhere people are actually charged from', () => {
    const html = renderToStaticMarkup(createElement(PricingTab, { draft: program(), issues: [], dispatch: () => {} }))
    expect(html).toContain('does <b>not</b> change what people are charged')
    expect(html).toContain('Google Sheet’s <b>Programs</b> tab')
    expect(html).toContain('Paystack payment page')
  })
})
