import { useEffect, useRef, useState } from 'react'

import { uploadMedia, useUploadMedia } from '../../../api/generated/media/media'
import type { UploadMedia } from '../../../api/generated/models'
import { ApiError } from '../../../lib/api-error'

export function useMediaUpload() {
  const [progress, setProgress] = useState(0)
  const controller = useRef<AbortController>()
  const mutation = useUploadMedia({
    mutation: {
      mutationFn: ({ data }) =>
        uploadMedia(data, {
          signal: controller.current?.signal,
          onUploadProgress: (event) => setProgress(Math.round((event.progress ?? 0) * 100)),
        }),
    },
  })
  useEffect(() => () => controller.current?.abort(), [])
  async function upload(file: File, purpose: UploadMedia['purpose']) {
    if (file.size > 2 * 1024 * 1024)
      throw new ApiError(413, 'ASSET_TOO_LARGE', 'Images must be at most 2 MiB.')
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
      throw new ApiError(400, 'INVALID_IMAGE', 'Select a PNG, JPEG or WebP image.')
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    setProgress(0)
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      current.signal.addEventListener(
        'abort',
        () => {
          reader.abort()
          reject(new Error('Upload cancelled'))
        },
        { once: true },
      )
      reader.onerror = () => reject(new Error('Unable to read this file.'))
      reader.onload = () => resolve(String(reader.result).split(',')[1]!)
      reader.readAsDataURL(file)
    })
    if (current.signal.aborted) throw new Error('Upload cancelled')
    return mutation.mutateAsync({
      data: {
        purpose,
        originalFilename: file.name,
        contentType: file.type as UploadMedia['contentType'],
        data,
      },
    })
  }
  return { upload, progress, cancel: () => controller.current?.abort() }
}
