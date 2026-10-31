// Photos picked in the draft, waiting for «حفظ» to upload them.

export interface PendingPhoto {
  file: File
  /** blob: URL showing the photo until it is saved. */
  blobUrl: string
}

/**
 * Called once `file` has been uploaded and saved for `personId`. Forgets it
 * — unless another photo was picked while it uploaded: that one stays
 * pending (its own upload is queued) and keeps its preview. Returns whether
 * the uploaded photo is now the one to show.
 */
export function settleUploadedPhoto(
  pending: Map<string, PendingPhoto>,
  personId: string,
  file: File,
  revoke: (url: string) => void = url => URL.revokeObjectURL(url),
): boolean {
  const entry = pending.get(personId)
  if (entry && entry.file !== file) return false
  if (entry) {
    revoke(entry.blobUrl)
    pending.delete(personId)
  }
  return true
}
