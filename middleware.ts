import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/supabase/types'

// Refreshes the Supabase session cookie on /edit and /login, and resolves
// the signed-in user's admin role exactly once, here — handing the result
// to the page via request headers (x-user-id, x-user-email, x-admin-role,
// x-admin-name) instead of letting the page re-check it itself.
//
// This used to also happen a second time in app/edit/page.tsx (its own
// call to supabase.auth.getUser(), then its own query against `admins`).
// That was the bug behind random full logouts: Supabase rotates refresh
// tokens on every use, so if two independent Supabase clients each try to
// refresh the same stored refresh token (here: this middleware's client,
// racing against the browser client's own background auto-refresh timer,
// or — before this fix — against app/edit/page.tsx's second client on
// the very same request), the loser's refresh attempt fails with a
// non-retryable "already used" error. @supabase/auth-js's reaction to
// that specific kind of failure is to call its internal _removeSession(),
// which wipes the session cookie — even though the *other* client's
// refresh had just succeeded moments earlier. A Server Component's own
// cookie writes are silently swallowed (see createClient()'s try/catch
// below) so it can never actually clear the browser's cookie itself, but
// middleware's writes are real: this is the one place in the whole app
// that can destructively wipe a session, so it must not share that job
// with anything else. See lib/supabase/client.ts for the other half of
// this fix (disabling the browser's background auto-refresh timer).
export async function middleware(request: NextRequest) {
  const cookiesToSet: { name: string; value: string; options: CookieOptions }[] = []

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(toSet) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          cookiesToSet.push(...toSet)
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    request.headers.set('x-user-id', user.id)
    if (user.email) request.headers.set('x-user-email', user.email)

    const { data: admin, error } = await supabase
      .from('admins')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      // Surfaced in the deployment's function logs — a query error here
      // (e.g. the 003_add_auth_roles.sql migration not having been
      // applied yet) would otherwise look identical to "not an admin".
      console.error('[middleware] admins lookup failed:', error.message)
    } else if (admin) {
      request.headers.set('x-admin-role', admin.role)
      if (admin.name) request.headers.set('x-admin-name', admin.name)
    }
  }

  const response = NextResponse.next({ request })
  cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  return response
}

export const config = {
  matcher: ['/edit', '/login'],
}
