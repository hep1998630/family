import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from a Server Component — safe to ignore
            // if you have a middleware refreshing sessions
          }
        },
      },
    }
  )
}

/**
 * A Supabase client that never reads or writes a session cookie — every
 * call uses the anon key. Use this for data that's publicly readable via
 * RLS (roots/people/partnerships/parent_child all have `select using
 * (true)` policies) so these reads can never trigger a session refresh.
 *
 * Why this matters: a client that *does* carry a session will still try
 * to attach it (via auth.getSession(), called internally by every
 * .from() call) even for a public read, and that can trigger a token
 * refresh. See middleware.ts's comment for why having more than one
 * refresh-capable client per request is what causes random logouts.
 */
export function createPublicClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {
          // never called — getAll() always returns no session to refresh
        },
      },
    }
  )
}
