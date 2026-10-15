import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // middleware.ts is the single place a session refresh happens —
        // see its comment. The browser client's own background refresh
        // timer would otherwise race against it for the same refresh
        // token and cause random logouts (Supabase rotates refresh
        // tokens on every use, so whichever client loses that race gets
        // an unrecoverable "already used" error). A page navigation to
        // /edit or /login still refreshes the session via middleware;
        // an interactive action (e.g. clicking Save) with a stale token
        // will fail with a clear error asking the admin to refresh the
        // page, rather than silently signing them out.
        autoRefreshToken: false,
      },
    }
  )
}
