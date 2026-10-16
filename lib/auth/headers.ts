/**
 * Reads a free-text header set by middleware.ts, which percent-encodes
 * these values because HTTP headers can't carry Arabic text as-is.
 */
export function readAuthHeader(headerList: Headers, name: string): string | null {
  const raw = headerList.get(name)
  if (raw === null) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
