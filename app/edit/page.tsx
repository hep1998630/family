import { redirect } from 'next/navigation'
import { createClient, getCurrentUserAndAdmin } from '@/lib/supabase/server'
import TreeApp from '@/components/branch/TreeApp'
import NotAnAdmin from '@/components/auth/NotAnAdmin'

export default async function EditPage({
  searchParams,
}: {
  searchParams: Promise<{ root?: string; focus?: string }>
}) {
  const { root, focus } = await searchParams
  const { user, admin } = await getCurrentUserAndAdmin()
  if (!user) redirect('/login')
  if (!admin) return <NotAnAdmin email={user.email ?? ''} />

  const supabase = await createClient()

  // Fetch all data server-side for initial render (SSR)
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
      isOwner={admin.role === 'owner'}
      adminName={admin.name ?? user.email ?? ''}
      initialRoots={roots ?? []}
      initialPeople={people ?? []}
      initialPartnerships={partnerships ?? []}
      initialParentChild={parentChild ?? []}
      initialRootId={root ?? null}
      initialFocusId={focus ?? null}
    />
  )
}
