import { and, eq } from 'drizzle-orm'

import { mediaAssets, organizationBrandAssets } from '../../../../../db/schema/media.js'
import type { Database, Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { withOwnerTransaction } from '../../../../lib/owner-context.js'

export function createOwnerBrandingRepository(database: () => Database) {
  return {
    attachWorkspace: async (
      tx: Transaction,
      images: (typeof mediaAssets.$inferInsert)[],
      actorId: string,
    ) => {
      for (const image of images)
        await tx
          .insert(mediaAssets)
          .values({ ...image, uploadedBy: actorId })
          .onConflictDoNothing()
    },
    get: (ownerId: string, organizationId: string, id: string) =>
      withOwnerTransaction(database(), ownerId, async (tx) => {
        const [asset] = await tx
          .select()
          .from(organizationBrandAssets)
          .where(
            and(
              eq(organizationBrandAssets.organizationId, organizationId),
              eq(organizationBrandAssets.id, id),
            ),
          )
        if (!asset) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Brand image not found.')
        return asset
      }),
    insert: (ownerId: string, input: typeof organizationBrandAssets.$inferInsert) =>
      withOwnerTransaction(database(), ownerId, (tx) =>
        tx.insert(organizationBrandAssets).values(input),
      ),
  }
}
