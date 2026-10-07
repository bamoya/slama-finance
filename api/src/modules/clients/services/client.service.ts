import { parsePhoneNumberFromString } from 'libphonenumber-js'

import {
  type ClientInput,
  ClientInputSchema,
  ClientOverviewSchema,
  ClientPageSchema,
  ClientSchema,
  type ClientUpdate,
} from '../../../contracts/generated/clients/clients.schemas.js'
import type { Transaction } from '../../../lib/db.js'
import { AppError } from '../../../lib/errors.js'
import { assertVersion, FinancialDecimal } from '../../../lib/validation.js'
import type { createClientRepository } from '../repositories/client.repository.js'

const dto = <T>(schema: { parse(value: unknown): T }, value: unknown): T =>
  schema.parse(JSON.parse(JSON.stringify(value)))
const nullable = (value: string | null) => value?.trim() || null
const displayName = (row: {
  type: string
  firstName: string | null
  lastName: string | null
  legalName: string | null
}) => (row.type === 'company' ? row.legalName! : `${row.firstName} ${row.lastName}`)
const output = (row: Awaited<ReturnType<ReturnType<typeof createClientRepository>['one']>>) =>
  dto(ClientSchema, { ...row, displayName: displayName(row) })

function normalize(input: ClientInput) {
  const data = ClientInputSchema.parse(input)
  const normalized = {
    ...data,
    firstName: nullable(data.firstName),
    lastName: nullable(data.lastName),
    legalName: nullable(data.legalName),
    tradeName: nullable(data.tradeName),
    contactName: nullable(data.contactName),
    email: nullable(data.email)?.toLowerCase() ?? null,
    phone: nullable(data.phone),
    ice: nullable(data.ice),
    taxIdentifier: nullable(data.taxIdentifier),
    registrationNumber: nullable(data.registrationNumber),
    registrationCity: nullable(data.registrationCity),
    professionalTaxNumber: nullable(data.professionalTaxNumber),
    addressLine1: data.addressLine1.trim(),
    addressLine2: nullable(data.addressLine2),
    city: data.city.trim(),
    postalCode: nullable(data.postalCode),
    countryCode: data.countryCode,
    deliveryAddressLine1: nullable(data.deliveryAddressLine1),
    deliveryAddressLine2: nullable(data.deliveryAddressLine2),
    deliveryCity: nullable(data.deliveryCity),
    deliveryPostalCode: nullable(data.deliveryPostalCode),
    deliveryCountryCode: data.deliveryCountryCode,
    notes: nullable(data.notes),
  }
  if (!normalized.addressLine1 || !normalized.city)
    throw new AppError(400, 'INVALID_ADDRESS', 'Billing address and city are required.')
  if (data.type === 'individual') {
    if (!normalized.firstName || !normalized.lastName)
      throw new AppError(
        400,
        'INVALID_CLIENT_IDENTITY',
        'Individual first and last names are required.',
      )
    if (
      [
        normalized.legalName,
        normalized.tradeName,
        normalized.contactName,
        normalized.ice,
        normalized.taxIdentifier,
        normalized.registrationNumber,
        normalized.registrationCity,
        normalized.professionalTaxNumber,
      ].some(Boolean)
    )
      throw new AppError(
        400,
        'INVALID_CLIENT_IDENTITY',
        'Business identity fields are not allowed for individuals.',
      )
  } else if (!normalized.legalName || normalized.firstName || normalized.lastName)
    throw new AppError(
      400,
      'INVALID_CLIENT_IDENTITY',
      'A company requires a legal name and no personal name fields.',
    )
  if (!!normalized.registrationNumber !== !!normalized.registrationCity)
    throw new AppError(
      400,
      'INVALID_REGISTRATION',
      'RC number and registration city must be supplied together.',
    )
  if (normalized.deliveryAddressLine1) {
    if (!normalized.deliveryCity || !normalized.deliveryCountryCode)
      throw new AppError(
        400,
        'INVALID_DELIVERY_ADDRESS',
        'A separate delivery address requires city and country.',
      )
  } else if (
    [
      normalized.deliveryAddressLine2,
      normalized.deliveryCity,
      normalized.deliveryPostalCode,
      normalized.deliveryCountryCode,
    ].some(Boolean)
  )
    throw new AppError(
      400,
      'INVALID_DELIVERY_ADDRESS',
      'Enter a complete separate delivery address or leave it empty.',
    )
  if (normalized.phone) {
    const phone = parsePhoneNumberFromString(normalized.phone, 'MA')
    if (!phone?.isValid()) throw new AppError(400, 'INVALID_PHONE', 'Enter a valid phone number.')
    normalized.phone = phone.number
  }
  return normalized
}

export function createClientService(
  repo: ReturnType<typeof createClientRepository>,
  onNotificationChange?: (tx: Transaction, id: string) => Promise<void>,
) {
  return {
    async list(filters: Parameters<typeof repo.list>[0], actor: string) {
      const [canInvoice, canPayment, canEstimate, canDelivery] = await Promise.all([
        repo.hasPermission(actor, 'invoices.read'),
        repo.hasPermission(actor, 'payments.read'),
        repo.hasPermission(actor, 'estimates.read'),
        repo.hasPermission(actor, 'delivery_notes.read'),
      ])
      const canFinance = canInvoice && canPayment
      const canActivity = canFinance && canEstimate && canDelivery
      if (
        (filters.balanceMin ||
          filters.balanceMax ||
          filters.overdueOnly ||
          ['invoiced', 'outstanding'].includes(filters.sortBy ?? '')) &&
        !canFinance
      )
        throw new AppError(
          403,
          'FORBIDDEN',
          'Invoice and payment read permissions are required for financial filters.',
        )
      if (
        (filters.lastActivityFrom || filters.lastActivityTo || filters.sortBy === 'lastActivity') &&
        !canActivity
      )
        throw new AppError(
          403,
          'FORBIDDEN',
          'Document and payment read permissions are required for activity filters.',
        )
      if (
        filters.balanceMin &&
        filters.balanceMax &&
        new FinancialDecimal(filters.balanceMin).gt(filters.balanceMax)
      )
        throw new AppError(
          400,
          'INVALID_AMOUNT_RANGE',
          'Minimum balance must not exceed maximum balance.',
        )
      if (
        filters.lastActivityFrom &&
        filters.lastActivityTo &&
        filters.lastActivityFrom > filters.lastActivityTo
      )
        throw new AppError(400, 'INVALID_DATE_RANGE', 'Start date must not follow end date.')
      const [page, financialCurrency] = await Promise.all([
        repo.list(filters),
        repo.financialCurrency(),
      ])
      const ids = page.items.map((row) => row.id)
      const [summaries, activityDates] = await Promise.all([
        canFinance ? repo.financialSummaries(ids) : Promise.resolve(null),
        canActivity ? repo.lastActivityDates(ids) : Promise.resolve(null),
      ])
      return dto(ClientPageSchema, {
        ...page,
        financialCurrency,
        items: page.items.map((row) => ({
          ...row,
          displayName: displayName(row),
          financialSummary: summaries?.get(row.id) ?? null,
          lastActivityAt: activityDates?.get(row.id) ?? null,
        })),
      })
    },
    async get(id: string) {
      return output(await repo.one(id))
    },
    async overview(id: string, actor: string) {
      const client = await repo.one(id)
      const [canInvoice, canPayment, canEstimate, canDelivery] = await Promise.all([
        repo.hasPermission(actor, 'invoices.read'),
        repo.hasPermission(actor, 'payments.read'),
        repo.hasPermission(actor, 'estimates.read'),
        repo.hasPermission(actor, 'delivery_notes.read'),
      ])
      const [summaries, recentActivity] = await Promise.all([
        canInvoice && canPayment ? repo.financialSummaries([id]) : Promise.resolve(null),
        repo.recentActivity(id, {
          invoices: canInvoice,
          payments: canPayment,
          estimates: canEstimate,
          deliveries: canDelivery,
        }),
      ])
      return dto(ClientOverviewSchema, {
        client: output(client),
        financialSummary: summaries?.get(id) ?? null,
        recentActivity: recentActivity.map((entry) => ({
          ...entry,
          date: new Date(entry.date).toISOString(),
        })),
      })
    },
    create(input: ClientInput, actor: string) {
      const data = normalize(input)
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'clients.create')
        const row = await repo.insert(data, actor, tx)
        await repo.audit(tx, actor, row.id, 'create', null, row)
        return output(row)
      })
    },
    update(id: string, input: ClientUpdate, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'clients.update')
        const before = await repo.one(id, tx)
        if (before.archivedAt)
          throw new AppError(409, 'CLIENT_ARCHIVED', 'Restore this client before editing.')
        assertVersion(before.version, input.expectedVersion)
        const { expectedVersion: _version, ...changes } = input
        const data = normalize(ClientInputSchema.strip().parse({ ...before, ...changes }))
        const row = await repo.update(id, data, actor, tx)
        if (row.email !== before.email) await onNotificationChange?.(tx, id)
        await repo.audit(tx, actor, id, 'update', before, row)
        return output(row)
      })
    },
    changeStatus(id: string, expectedVersion: number, actor: string, restore: boolean) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, restore ? 'clients.update' : 'clients.update')
        const before = await repo.one(id, tx)
        assertVersion(before.version, expectedVersion)
        if (restore ? !before.archivedAt : !!before.archivedAt)
          throw new AppError(409, 'INVALID_STATUS', 'Client already has this status.')
        const row = await repo.update(id, { archivedAt: restore ? null : new Date() }, actor, tx)
        await onNotificationChange?.(tx, id)
        await repo.audit(tx, actor, id, restore ? 'restore' : 'archive', before, row)
        return output(row)
      })
    },
    delete(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'clients.delete')
        const before = await repo.one(id, tx)
        assertVersion(before.version, expectedVersion)
        await repo.delete(id, tx)
        await repo.audit(tx, actor, id, 'delete', before, before)
      })
    },
  }
}
