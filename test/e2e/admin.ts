// Plain REST calls to the local Supabase admin APIs (the secret key bypasses RLS): loading
// @supabase/supabase-js from Playwright's CommonJS runner hits a Node 22 require(esm) bug.
export async function supabaseAdmin<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.E2E_SUPABASE_SECRET_KEY!
  const response = await fetch(`${process.env.E2E_SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
  })
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status} ${await response.text()}`)
  return (response.status === 204 ? null : await response.json()) as T
}

// Rows inserted through PostgREST, returned.
export function insertRows<T>(table: string, rows: object[]): Promise<T[]> {
  return supabaseAdmin<T[]>(`/rest/v1/${table}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(rows),
  })
}
