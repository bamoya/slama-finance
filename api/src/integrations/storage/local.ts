import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { AppError } from '../../lib/errors.js'
import type { ObjectStorage } from '../contracts.js'

// Development/test fallback only; files are served through authorized API routes.
export function createLocalStorage(directory: string): ObjectStorage {
  const root = path.resolve(directory)
  const isArtifactKey = (key: string) =>
    /^artifacts\/(?:invoice|estimate|delivery_note|payment_receipt|report_run)\/[a-f0-9-]{36}\.pdf$/.test(
      key,
    ) || /^artifacts\/report_run\/[a-f0-9-]{36}\.(csv|xlsx)$/.test(key)
  function target(key: string) {
    if (!/^media\/[a-f0-9-]{36}\.png$/.test(key) && !isArtifactKey(key))
      throw new AppError(400, 'INVALID_ASSET_KEY', 'Invalid storage key.')
    return path.join(root, key)
  }
  return {
    async putImmutable(input) {
      const file = target(input.key)
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
      await writeFile(file, input.bytes, { flag: 'wx', mode: 0o600 })
      return {
        key: input.key,
        contentType: input.contentType,
        byteSize: input.bytes.length,
        sha256: createHash('sha256').update(input.bytes).digest('hex'),
      }
    },
    async get(key) {
      try {
        return await readFile(target(key))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found.')
        throw error
      }
    },
    async deleteUnreferenced(key) {
      try {
        await unlink(target(key))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    },
    async signedDownloadUrl() {
      throw new AppError(503, 'SIGNED_URL_UNAVAILABLE', 'Use the authenticated download endpoint.')
    },
    async list(prefix) {
      if (prefix !== 'artifacts/')
        throw new AppError(400, 'INVALID_ASSET_KEY', 'Invalid listing prefix.')
      const entries = []
      for (const kind of [
        'invoice',
        'estimate',
        'delivery_note',
        'payment_receipt',
        'report_run',
      ]) {
        const directory = path.join(root, 'artifacts', kind)
        let names: string[]
        try {
          names = await readdir(directory)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
          throw error
        }
        for (const name of names) {
          const key = `artifacts/${kind}/${name}`
          if (!isArtifactKey(key)) continue
          const info = await stat(target(key))
          entries.push({ key, lastModified: info.mtime })
        }
      }
      return entries
    },
  }
}
