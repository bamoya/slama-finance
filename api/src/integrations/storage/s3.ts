import { createHash } from 'node:crypto'

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { AppError } from '../../lib/errors.js'
import type { ObjectStorage } from '../contracts.js'

export interface S3StorageConfig {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

// Keys are application-generated identifiers, never user filenames or URLs.
function checkKey(key: string) {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,1023}$/.test(key) ||
    key.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new AppError(400, 'INVALID_ASSET_KEY', 'Invalid storage key.')
}

export function createS3Storage(config: S3StorageConfig): ObjectStorage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })
  return {
    async putImmutable(input) {
      checkKey(input.key)
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: input.key,
          Body: input.bytes,
          ContentType: input.contentType,
          IfNoneMatch: '*',
        }),
      )
      return {
        key: input.key,
        contentType: input.contentType,
        byteSize: input.bytes.byteLength,
        sha256: createHash('sha256').update(input.bytes).digest('hex'),
      }
    },
    async get(key) {
      checkKey(key)
      try {
        const response = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        )
        if (!response.Body) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found.')
        return await response.Body.transformToByteArray()
      } catch (error) {
        if ((error as { name?: string }).name === 'NoSuchKey')
          throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found.')
        throw error
      }
    },
    async signedDownloadUrl(key, expiresInSeconds) {
      checkKey(key)
      if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 900)
        throw new AppError(
          400,
          'INVALID_URL_EXPIRY',
          'Download links must expire within 15 minutes.',
        )
      return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
        expiresIn: expiresInSeconds,
      })
    },
    async deleteUnreferenced(key) {
      // Authorization, references and retention must be checked by the calling domain.
      checkKey(key)
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }))
    },
    async list(prefix) {
      if (prefix !== 'artifacts/')
        throw new AppError(400, 'INVALID_ASSET_KEY', 'Invalid listing prefix.')
      const entries = []
      let continuationToken: string | undefined
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        )
        for (const object of page.Contents ?? []) {
          if (object.Key && object.LastModified)
            entries.push({ key: object.Key, lastModified: object.LastModified })
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (continuationToken)
      return entries
    },
  }
}
