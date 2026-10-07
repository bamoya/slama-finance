/* eslint-disable no-console -- Read-only document QA CLI. */
import { writeFile } from 'node:fs/promises'

import { eq } from 'drizzle-orm'

import { invoices } from '../db/schema/invoices.js'
import { loadEnvironment } from '../src/config/env.js'
import { createLocalStorage } from '../src/integrations/storage/local.js'
import { createS3Storage } from '../src/integrations/storage/s3.js'
import { createDatabase } from '../src/lib/db.js'
import { createMediaModule } from '../src/modules/media/index.js'
import { createInvoiceRepository } from '../src/modules/sales/invoices/repositories/invoice.repository.js'
import { renderSalesPdf } from '../src/modules/sales/shared/services/sales-pdf.service.js'

const [number, output] = process.argv.slice(2)
if (!number || !output) throw new Error('Usage: verify-invoice-pdf <invoice-number> <output.pdf>')
const env = loadEnvironment()
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const connection = createDatabase(env.DATABASE_URL)
try {
  const storage =
    env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? createS3Storage({
          endpoint: env.S3_ENDPOINT,
          region: env.S3_REGION,
          bucket: env.S3_BUCKET,
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        })
      : createLocalStorage(env.MEDIA_ASSET_DIR)
  const [match] = await connection.db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.number, number))
  if (!match) throw new Error('Invoice not found')
  const repo = createInvoiceRepository(() => connection.db)
  const row = await repo.one(match.id)
  const lines = await repo.lines(row.id)
  const images = await createMediaModule(() => connection.db, storage).publicApi.documentImages(
    'invoice',
    row.id,
    row.contentVersion,
  )
  const bytes = await renderSalesPdf(row, lines, 'INVOICE', images)
  await writeFile(output, bytes)
  console.log(
    JSON.stringify({
      output,
      bytes: bytes.length,
      rows: lines.length,
      logo: !!images.logo,
      signature: !!images.signature,
    }),
  )
} finally {
  await connection.close()
}
