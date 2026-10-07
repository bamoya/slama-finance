import type { ObjectStorage } from '../../integrations/contracts.js'
import type { Database } from '../../lib/db.js'
import { createArtifactRepository } from './repositories/artifact.repository.js'
import { type ArtifactOwnerAccess, createArtifactService } from './services/artifact.service.js'
import { createArtifactCleanupService } from './services/artifact-cleanup.service.js'

export type { ArtifactOwnerAccess, DocumentType } from './services/artifact.service.js'

export function createArtifactSupport(
  database: () => Database,
  storage: ObjectStorage,
  owners: ArtifactOwnerAccess,
) {
  const repository = createArtifactRepository(database)
  return {
    service: createArtifactService(repository, storage, owners),
    cleanup: createArtifactCleanupService(repository, storage),
  }
}

export function createArtifactCleanup(database: () => Database, storage: ObjectStorage) {
  return createArtifactCleanupService(createArtifactRepository(database), storage)
}
