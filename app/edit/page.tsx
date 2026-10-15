import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createPublicClient } from '@/lib/supabase/server'
import TreeApp from '@/components/branch/TreeApp'
import NotAnAdmin from '@/components/auth/NotAnAdmin'

export default async function EditPage({
  searchParams,
}: {
  searchParams: Promise<{ root?: string; focus?: string }>
}) {
  const { root, focus } = await searchParams

  // Resolved once by middleware.ts — see its comment for why the page
  // must not independently re-check auth.getUser() / query `admins`.
  const headerList = await headers()
  const userId = headerList.get('x-user-id')
  const userEmail = headerList.get('x-user-email')
  const adminRole = headerList.get('x-admin-role') as 'owner' | 'editor' | null
  const adminName = headerList.get('x-admin-name')

  if (!userId) redirect('/login')
  if (!adminRole) return <NotAnAdmin email={userEmail ?? ''} userId={userId} />

  const supabase = createPublicClient()

  // Fetch all data server-side for initial render (SSR) — public reads,
  // no session needed (see createPublicClient's doc comment).
  const [
    { data: roots },
    { data: people },
    { data: partnerships },
    { data: parentChild },
  ] = await Promise.all([
    supabase.from('roots').select('*').order('created_at'),
    supabase.from('people').select('*'),
    supabase.from('partnerships').select('*'),
    supabase.from('parent_child').select('*'),
  ])

  return (
    <TreeApp
      isEditable={true}
      isOwner={adminRole === 'owner'}
      adminName={adminName ?? userEmail ?? ''}
      initialRoots={roots ?? []}
      initialPeople={people ?? []}
      initialPartnerships={partnerships ?? []}
      initialParentChild={parentChild ?? []}
      initialRootId={root ?? null}
      initialFocusId={focus ?? null}
    />
  )
}
