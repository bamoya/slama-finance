import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'

const headers = { origin: 'http://localhost:5173' }
const productInput = (reference: string, categoryId: string | null) => ({
  reference,
  name: reference === 'WHT-1' ? 'Wheat' : 'Barley',
  description: null,
  categoryId,
  imageAssetId: null,
  suggestedVatRate: null,
  variants: [{ weightG: 500, pricePerItem: '10.00', costPerItem: null, active: true }],
})

describe('Catalog insights', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookies: { slama_session: string }
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    const hash = await createPasswordService().hash('insights-password-123')
    await fixture.client`update users set password_hash=${hash} where id=${testUserId}`
    await fixture.client`insert into user_roles (user_id,role_id) select ${testUserId},id from roles where key='admin'`
    app = await buildApp({ environment: loadEnvironment({ NODE_ENV: 'test' }), logger: false })
    app.database = () => fixture.db
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers,
      payload: { email: 'operator@example.test', password: 'insights-password-123' },
    })
    cookies = { slama_session: login.cookies[0]!.value }
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  const get = (url: string) => app.inject({ method: 'GET', url, cookies })
  const post = (url: string, payload: object) =>
    app.inject({ method: 'POST', url, cookies, headers, payload })

  async function seedSales() {
    const category = (await post('/v1/categories', { name: 'Grains', description: null })).json()
    const wheat = (await post('/v1/products', productInput('WHT-1', category.id))).json()
    const barley = (await post('/v1/products', productInput('BRL-1', category.id))).json()
    const [client] = await fixture.client`
      insert into clients(type, legal_name, address_line1, city)
      values('company', 'Buyer SARL', '12 Atlas', 'Casablanca') returning id
    `
    const createInvoice = async (
      number: string,
      status: string,
      currency: string,
      issueDate: string,
    ) => {
      const taxed = number === 'INV-INS-1'
      const [row] = await fixture.client`
        insert into invoices(number, status, client_id, issue_date, due_date, currency,
          issuer_snapshot, client_snapshot, appearance_snapshot, subtotal, tax_total, total, issued_at)
        values(${number}, ${status}, ${client!.id}, ${issueDate}::date, '2026-10-30', ${currency},
          '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '50.00', ${taxed ? '4.00' : '0.00'}, ${taxed ? '54.00' : '50.00'}, now()) returning id
      `
      return row!.id as string
    }
    const invoice = await createInvoice('INV-INS-1', 'issued', 'MAD', '2026-09-15')
    const euroInvoice = await createInvoice('INV-INS-2', 'sent', 'EUR', '2026-09-16')
    const cancelled = await createInvoice('INV-INS-3', 'cancelled', 'MAD', '2026-09-17')
    const line = async (
      invoiceId: string,
      product: typeof wheat,
      quantity: number,
      net: string,
      weight: number | null = 500,
      tax = '0.00',
    ) => {
      const total = (Number(net) + Number(tax)).toFixed(2)
      await fixture.client`
        insert into invoice_lines(invoice_id, product_id, product_variant_id, position,
          product_name, package_weight_g, quantity, unit_price, net_amount, tax_amount, total_amount)
        values(${invoiceId}, ${product.id}, ${product.variants[0].id},
          (select count(*) from invoice_lines where invoice_id=${invoiceId}), ${product.name},
          ${weight}, ${quantity}, '10.00', ${net}, ${tax}, ${total})
      `
    }
    await line(invoice, wheat, 2, '20.00', 750, '4.00')
    await line(invoice, barley, 3, '30.00', 500)
    await line(euroInvoice, wheat, 4, '40.00', 500)
    await line(cancelled, wheat, 9, '90.00', 500)
    await fixture.client`
      insert into invoice_lines(invoice_id, product_id, position, product_name, quantity,
        unit_price, net_amount, tax_amount, total_amount)
      values(${invoice}, ${wheat.id}, 2, 'Manual unlinked item', 1, '100.00', '100.00', '0.00', '100.00')
    `
    const [draft] = await fixture.client`
      insert into invoices(status, client_id, issue_date, currency, issuer_snapshot,
        client_snapshot, appearance_snapshot, subtotal, tax_total, total)
      values('draft', ${client!.id}, '2026-09-18', 'MAD', '{}'::jsonb, '{}'::jsonb,
        '{}'::jsonb, '100.00', '0.00', '100.00') returning id
    `
    await line(draft!.id as string, wheat, 10, '100.00')
    return { category, wheat, barley, invoice }
  }

  it('aggregates VAT-exclusive issued sales, unique invoices, snapshot weight, and one currency', async () => {
    const { category, wheat, invoice } = await seedSales()
    const products = await get(
      '/v1/products/insights?includeFinancial=true&period=all&currency=MAD&sortBy=revenue&sortOrder=desc',
    )
    expect(products.statusCode).toBe(200)
    expect(products.json()).toMatchObject({
      total: 2,
      financialIncluded: true,
      currency: 'MAD',
      catalogCurrency: 'MAD',
      summary: {
        financial: { unitsSold: 5, weightSoldG: 3000, netRevenue: '50.00', invoiceCount: 1 },
      },
    })
    expect(
      products.json().items.map((item: { product: { id: string } }) => item.product.id),
    ).toEqual([expect.any(String), wheat.id])
    const detail = await get(
      `/v1/products/${wheat.id}/insights?includeFinancial=true&includeRecentInvoices=true&period=all&currency=MAD&recentInvoiceLimit=1`,
    )
    expect(detail.statusCode).toBe(200)
    expect(detail.json()).toMatchObject({
      financial: { unitsSold: 2, weightSoldG: 1500, netRevenue: '20.00', invoiceCount: 1 },
      variants: [{ financial: { unitsSold: 2, weightSoldG: 1500, netRevenue: '20.00' } }],
      recentInvoiceTotal: 1,
      recentInvoices: [{ id: invoice, quantity: 2, weightSoldG: 1500, netRevenue: '20.00' }],
    })
    const categories = await get(
      '/v1/categories/insights?includeFinancial=true&period=all&currency=MAD',
    )
    expect(categories.statusCode).toBe(200)
    expect(categories.json()).toMatchObject({
      summary: {
        financial: { netRevenue: '50.00', invoiceCount: 1 },
        topCategory: { id: category.id, netRevenue: '50.00' },
      },
      items: [{ productCount: 2, financial: { netRevenue: '50.00', invoiceCount: 1 } }],
    })
    const categoryDetail = await get(
      `/v1/categories/${category.id}/insights?includeFinancial=true&period=all&sortBy=revenue&sortOrder=desc&pageSize=1`,
    )
    expect(categoryDetail.statusCode).toBe(200)
    expect(categoryDetail.json()).toMatchObject({
      productCount: 2,
      financial: { netRevenue: '50.00', invoiceCount: 1 },
      products: { total: 2, pageSize: 1, items: [{ product: { reference: 'BRL-1' } }] },
    })
    const euros = await get(
      `/v1/products/${wheat.id}/insights?includeFinancial=true&period=all&currency=EUR`,
    )
    expect(euros.json().financial).toMatchObject({
      unitsSold: 4,
      netRevenue: '40.00',
      currency: 'EUR',
    })
    const dates = await get(
      `/v1/products/${wheat.id}/insights?includeFinancial=true&period=custom&dateFrom=2026-09-16&dateTo=2026-09-20&currency=MAD`,
    )
    expect(dates.json().financial).toMatchObject({ unitsSold: 0, netRevenue: '0.00' })
    const otherCategory = (
      await post('/v1/categories', { name: 'Other grains', description: null })
    ).json()
    await fixture.client`update products set category_id=${otherCategory.id} where id=${wheat.id}`
    const reassigned = await get(
      '/v1/categories/insights?includeFinancial=true&period=all&currency=MAD',
    )
    expect(reassigned.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: expect.objectContaining({ id: category.id }),
          financial: expect.objectContaining({ netRevenue: '30.00' }),
        }),
        expect.objectContaining({
          category: expect.objectContaining({ id: otherCategory.id }),
          financial: expect.objectContaining({ netRevenue: '20.00' }),
        }),
      ]),
    )
    const [secondInvoice] = await fixture.client`
      insert into invoices(number, status, client_id, issue_date, due_date, currency,
        issuer_snapshot, client_snapshot, appearance_snapshot, subtotal, tax_total, total, issued_at)
      select 'INV-INS-4', 'issued', client_id, '2026-09-20', due_date, 'MAD',
        issuer_snapshot, client_snapshot, appearance_snapshot, '10.00', '0.00', '10.00', now()
      from invoices where id=${invoice} returning id
    `
    await fixture.client`
      insert into invoice_lines(invoice_id, product_id, product_variant_id, position,
        product_name, package_weight_g, quantity, unit_price, net_amount, tax_amount, total_amount)
      values(${secondInvoice!.id}, ${wheat.id}, ${wheat.variants[0].id}, 0, 'Wheat', 500,
        1, '10.00', '10.00', '0.00', '10.00')
    `
    const nextRecent = await get(
      `/v1/products/${wheat.id}/insights?includeFinancial=true&includeRecentInvoices=true&period=all&recentInvoiceLimit=1&recentInvoiceOffset=1`,
    )
    expect(nextRecent.json()).toMatchObject({
      recentInvoiceTotal: 2,
      recentInvoices: [{ id: invoice }],
    })
  })

  it('keeps catalog counts available while denying finance sorts and redacting category names', async () => {
    const { category, wheat } = await seedSales()
    await fixture.client`
      delete from role_permissions rp using roles r, permissions p
      where rp.role_id=r.id and rp.permission_id=p.id and r.key='admin'
        and p.key in ('reports.read','reports.sections.revenue','categories.read')
    `
    const counts = await get('/v1/products/insights?period=all')
    expect(counts.statusCode).toBe(200)
    expect(counts.json().summary).toMatchObject({ productCount: 2, financial: null })
    expect(
      counts.json().items.find((item: { product: { id: string } }) => item.product.id === wheat.id),
    ).toMatchObject({
      product: { categoryId: category.id },
      categoryName: null,
      financial: null,
    })
    expect((await get('/v1/products/insights?includeFinancial=true&period=all')).statusCode).toBe(
      403,
    )
    expect((await get('/v1/products/insights?sortBy=revenue')).statusCode).toBe(403)
    expect((await get(`/v1/categories/${category.id}/insights`)).statusCode).toBe(403)
  })

  it('requires invoice read permission for paginated recent invoices and validates filters', async () => {
    const { category, wheat } = await seedSales()
    await fixture.client`
      delete from role_permissions rp using roles r, permissions p
      where rp.role_id=r.id and rp.permission_id=p.id and r.key='admin' and p.key='invoices.read'
    `
    expect(
      (
        await get(
          `/v1/products/${wheat.id}/insights?includeFinancial=true&includeRecentInvoices=true&period=all`,
        )
      ).statusCode,
    ).toBe(403)
    expect(
      (await get(`/v1/products/${wheat.id}/insights?includeRecentInvoices=true`)).statusCode,
    ).toBe(400)
    expect(
      (await get('/v1/products/insights?categoryId=' + category.id + '&uncategorized=true'))
        .statusCode,
    ).toBe(400)
    expect(
      (await get('/v1/products/insights?period=custom&dateFrom=2026-10-01&dateTo=2026-09-01'))
        .statusCode,
    ).toBe(400)
    expect((await get('/v1/products/insights?period=all&dateFrom=2026-09-01')).statusCode).toBe(400)
    const detail = await get(`/v1/products/${wheat.id}/insights?period=all`)
    expect(detail.statusCode).toBe(200)
    expect(detail.json()).toMatchObject({
      recentInvoices: [],
      recentInvoiceTotal: 0,
      recentInvoicesIncluded: false,
    })
  })
})
