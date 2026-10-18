// Signed URLs of the profile photos (#150), asked by the browser. Pages get each member's photo as a storage path;
// the paths asked for in the same tick are signed in one request, and the URLs kept until shortly before they
// expire, so a list refreshed by a search or a poll keeps the same image rather than downloading it again under a
// new URL. A failed request (offline) is not kept: the next ask tries again.
export type SignPaths = (paths: string[]) => Promise<(string | null)[]>

export interface SignedUrlCache {
  // The URL already signed for a path, while it stays valid for a while
  peek: (path: string) => string | undefined
  // null when the path can't be signed (no such file, offline)
  get: (path: string) => Promise<string | null>
}

// Signed again when less than this is left (ms), so an image shown just before its URL expires still loads.
const RENEW_MARGIN_MS = 5 * 60 * 1000

export function createSignedUrlCache(sign: SignPaths, ttlMs: number, now: () => number = Date.now): SignedUrlCache {
  const signed = new Map<string, { url: string, expiresAt: number }>()
  const pending = new Map<string, Promise<string | null>>()
  let batch: { paths: string[], urls: Promise<(string | null)[]> } | null = null

  function peek(path: string) {
    const entry = signed.get(path)
    return entry && entry.expiresAt - now() > RENEW_MARGIN_MS ? entry.url : undefined
  }

  function signLater(path: string): Promise<string | null> {
    if (!batch) {
      const paths: string[] = []
      const urls = Promise.resolve().then(async () => {
        batch = null
        const signedAt = now()
        const result = await sign(paths).catch(() => paths.map(() => null))
        result.forEach((url, i) => {
          if (url) signed.set(paths[i]!, { url, expiresAt: signedAt + ttlMs })
        })
        return result
      })
      batch = { paths, urls }
    }
    const index = batch.paths.push(path) - 1
    return batch.urls.then(urls => urls[index] ?? null)
  }

  function get(path: string) {
    const url = peek(path)
    if (url) return Promise.resolve(url)
    let request = pending.get(path)
    if (!request) {
      request = signLater(path).finally(() => pending.delete(path))
      pending.set(path, request)
    }
    return request
  }

  return { peek, get }
}
