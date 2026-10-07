import { Decimal } from 'decimal.js'

import { ExpectedVersionSchema as versionSchema } from '../contracts/generated/shared/common.schemas.js'
export {
  CalendarDateSchema as dateSchema,
  MoneySchema as moneySchema,
  TimestampSchema as timestampSchema,
  UnitPriceSchema as unitPriceSchema,
  UuidSchema as uuidSchema,
  ExpectedVersionSchema as versionSchema,
  WeightSchema as weightSchema,
} from '../contracts/generated/shared/common.schemas.js'

import { AppError } from './errors.js'

export const FinancialDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP })
export function assertVersion(actual: number, expected: number) {
  versionSchema.parse(expected)
  if (actual !== expected)
    throw new AppError(409, 'STALE_VERSION', 'This record changed. Reload before saving.')
}
export function companyDate(value: Date, timezone = 'Africa/Casablanca'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
