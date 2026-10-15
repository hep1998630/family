import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { AdminRow, Database } from './types'

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
 * Resolves the signed-in user (if any) and their admin row (if any) —
 * `admin` is null both when there's no session and when the signed-in
 * user isn't an admin.
 */
export async function getCurrentUserAndAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, admin: null as AdminRow | null }

  const { data: admin } = await supabase
    .from('admins')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  return { user, admin: admin ?? null }
}

/** Convenience wrapper over {@link getCurrentUserAndAdmin} for callers that only need the admin row. */
export async function getCurrentAdmin(): Promise<AdminRow | null> {
  const { admin } = await getCurrentUserAndAdmin()
  return admin
}
