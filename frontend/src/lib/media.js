// Uploading progress photos and chat attachments (served back by api/routes/media.js).
import { api } from './api.js'

export const MEDIA_MAX_BYTES = 10 * 1024 * 1024

// Same-origin URL: the session cookie goes along, which is how the server decides who may see it.
export const mediaUrl = id => '/api/media?id=' + encodeURIComponent(id)

export function readAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

// Photos are shrunk on the device before they leave it. A phone camera's 4–12 MB original is far
// more than a progress photo or a chat picture needs, and base64 makes it a third bigger again.
export async function downscaleImage(file, maxSide = 1600, quality = 0.85) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return file
    return new File([blob], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(url)
  }
}

// `peer` is required for chat files: it is the one other person allowed to open the file.
export async function uploadMedia(file, { purpose = 'photo', peer } = {}) {
  const f = file.type && file.type.startsWith('image/') ? await downscaleImage(file) : file
  if (f.size > MEDIA_MAX_BYTES) throw new Error('File too large — the limit is 10 MB.')
  const data = await readAsBase64(f)
  const { media } = await api('/api/media', {
    method: 'POST',
    body: JSON.stringify({ name: f.name || 'file', mime: f.type || 'application/octet-stream', data, purpose, peer })
  })
  return media
}
