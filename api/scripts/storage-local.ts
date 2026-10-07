/* eslint-disable no-console -- Local setup/check CLI output. */
import { randomUUID } from 'node:crypto'

import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'

import { createS3Storage } from '../src/integrations/storage/s3.js'

// Intentionally fixed local config: this script must never provision or delete OCI data.
const config = {
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  bucket: 'slama-media',
  accessKeyId: 'slama-local',
  secretAccessKey: 'slama-local-development-only',
}
const client = new S3Client({ ...config, forcePathStyle: true, credentials: config })
try {
  await client.send(new HeadBucketCommand({ Bucket: config.bucket }))
} catch (error) {
  if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404)
    throw error
  await client.send(new CreateBucketCommand({ Bucket: config.bucket }))
}
if (process.argv.includes('--check')) {
  const storage = createS3Storage(config)
  const key = `storage-check/${randomUUID()}.txt`
  const bytes = new TextEncoder().encode('Slama storage verification')
  try {
    await storage.putImmutable({ key, bytes, contentType: 'text/plain' })
    const downloaded = await storage.get(key)
    if (!Buffer.from(downloaded).equals(Buffer.from(bytes))) throw new Error('Download mismatch')
    let refused = false
    try {
      await storage.putImmutable({ key, bytes, contentType: 'text/plain' })
    } catch (error) {
      refused =
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412
      if (!refused) throw error
    }
    if (!refused) throw new Error('Storage allowed overwrite of an immutable key')
    const signed = await fetch(await storage.signedDownloadUrl(key, 60))
    if (!signed.ok || !Buffer.from(await signed.arrayBuffer()).equals(Buffer.from(bytes)))
      throw new Error('Signed download failed')
    const anonymous = await fetch(`${config.endpoint}/${config.bucket}/${key}`)
    if (anonymous.status !== 403) throw new Error('Bucket is not private')
  } finally {
    await storage.deleteUnreferenced(key)
  }
  let missing = false
  try {
    await storage.get(key)
  } catch (error) {
    missing = (error as { code?: string }).code === 'ASSET_NOT_FOUND'
  }
  if (!missing) throw new Error('Deletion verification failed')
  console.log('PASS: upload, download, immutable keys, signed URL, private access and deletion.')
} else console.log('Local private bucket slama-media is ready.')
client.destroy()
