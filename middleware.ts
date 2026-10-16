import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/supabase/types'

// Header names this middleware uses to hand auth results to the page.
// Trusted ONLY because they are stripped from the incoming request below
// before anything else runs, then set fresh from our own verified lookup —
// never forwarded from whatever the client itself sent.
const AUTH_HEADERS = ['x-user-id', 'x-user-email', 'x-admin-role', 'x-admin-name', 'x-admin-error']

// HTTP header values must be Latin-1, so free text (an Arabic admin name,
// an error message) is percent-encoded here and decoded by the page with
// readAuthHeader() from lib/auth/headers.ts. Setting a raw Arabic string
// throws and turns the whole /edit request into a server error.
const encode = (value: string) => encodeURIComponent(value)

// Refreshes the Supabase session cookie on /edit and /login, and resolves
// the signed-in user's admin role exactly once, here — handing the result
// to the page via the request headers above instead of letting the page
// re-check it itself.
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
  // Strip any copies of these headers the CLIENT sent, before any other
  // logic runs. Without this, an anonymous request could set
  // `x-admin-role: owner` itself and app/edit/page.tsx would trust it —
  // RLS still blocks the actual writes, but the edit UI would render for
  // anyone. These headers are only ever meaningful when *we* set them,
  // fresh, from the verified lookup below.
  AUTH_HEADERS.forEach(name => request.headers.delete(name))

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
    if (user.email) request.headers.set('x-user-email', encode(user.email))

    const { data: admin, error } = await supabase
      .from('admins')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      // A real query error (e.g. a migration not applied, or — as seen in
      // production — a fresh Supabase project that no longer auto-grants
      // table access to anon/authenticated by default, see
      // 004_grant_data_api_access.sql) must never look identical to "not
      // an admin": that makes a server misconfiguration undiagnosable.
      // Logged for the deployment's function logs, and also passed
      // through so the page can show a distinct error instead of the
      // generic "not an admin" screen.
      console.error('[middleware] admins lookup failed:', error.message)
      request.headers.set('x-admin-error', encode(error.message))
    } else if (admin) {
      request.headers.set('x-admin-role', admin.role)
      if (admin.name) request.headers.set('x-admin-name', encode(admin.name))
    }
  }

  const response = NextResponse.next({ request })
  cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  return response
}

export const config = {
  matcher: ['/edit', '/login'],
}
