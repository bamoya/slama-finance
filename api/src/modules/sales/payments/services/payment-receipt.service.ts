import { PaymentReceiptSnapshotSchema } from '../../../../contracts/generated/sales/payments.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { assertVersion } from '../../../../lib/validation.js'
import type {
  ArtifactOwnerAccess,
  createArtifactSupport,
} from '../../../../support/artifacts/index.js'
import type { createPaymentRepository } from '../repositories/payment.repository.js'

type Repository = ReturnType<typeof createPaymentRepository>
type Artifacts = ReturnType<typeof createArtifactSupport>['service']

export function createPaymentReceiptOwner(repo: Repository): ArtifactOwnerAccess {
  return {
    async assertPublishable(tx, _type, id, version) {
      assertVersion((await repo.one(id, tx, true)).version, version)
    },
    async assertReadable(tx, _type, id, actor) {
      await repo.authorize(tx, actor, 'payments.read')
      await repo.one(id, tx)
    },
    async assertCurrent(tx, artifact) {
      assertVersion((await repo.one(artifact.documentId, tx)).version, artifact.sourceVersion)
    },
    async published(tx, artifact) {
      const row = await repo.one(artifact.documentId, tx, true)
      if (!row.receiptIssuedAt) {
        await repo.receiptMetadata(row.id, { receiptIssuedAt: artifact.generatedAt }, tx)
        await repo.audit(tx, artifact.createdByUserId!, 'issue_receipt', row.id, null, {
          receiptNumber: row.number.replace(/^PAY-/, 'REC-'),
          artifactId: artifact.id,
        })
      }
    },
  }
}

export function createPaymentReceiptService(
  repo: Repository,
  artifacts: Artifacts,
  render: (id: string, version: number, design: 'saved' | 'latest') => Promise<Uint8Array>,
) {
  async function prepare(id: string, actor: string) {
    return repo.transaction(async (tx) => {
      await repo.authorize(tx, actor, 'payments.read')
      const initial = await repo.one(id, tx)
      if (!initial.receiptIssuedAt) await repo.authorize(tx, actor, 'payments.update')
      // Use the same lock order as payment lifecycle operations.
      const invoice = await repo.invoice(initial.invoiceId, tx)
      const row = await repo.one(id, tx, true)
      if (row.receiptSnapshot) return row
      // Legacy records have no trustworthy balance at recording. Never invent one.
      return repo.receiptMetadata(
        id,
        {
          receiptSnapshot: PaymentReceiptSnapshotSchema.parse({
            invoiceNumber: invoice.number,
            invoiceTotal: invoice.total,
            issuer: invoice.issuerSnapshot,
            client: invoice.clientSnapshot,
            appearance: invoice.appearanceSnapshot,
            templateId: invoice.templateId,
            capturedAt: null,
            paidAtRecording: null,
            remainingAtRecording: null,
          }),
        },
        tx,
      )
    })
  }
  async function generate(id: string, actor: string, design: 'saved' | 'latest', force: boolean) {
    const row = await prepare(id, actor)
    if (!force) {
      const existing = (await artifacts.list('payment_receipt', id, actor)).find(
        (file) => file.sourceVersion === row.version,
      )
      if (existing) return { id: existing.id, generatedAt: existing.generatedAt.toISOString() }
    }
    const authorize = async (tx: Transaction) => {
      await repo.authorize(tx, actor, 'payments.read')
      if (force || !(await repo.one(id, tx)).receiptIssuedAt)
        await repo.authorize(tx, actor, 'payments.update')
    }
    const result = await artifacts.regeneratePdf({
      type: 'payment_receipt',
      documentId: id,
      sourceVersion: row.version,
      actor,
      design,
      authorize,
      render: () => render(id, row.version, design),
    })
    return { id: result.id, generatedAt: result.generatedAt.toISOString() }
  }
  return {
    download: (id: string, actor: string) => generate(id, actor, 'saved', false),
    regenerate: (id: string, actor: string, design: 'saved' | 'latest') =>
      generate(id, actor, design, true),
  }
}
