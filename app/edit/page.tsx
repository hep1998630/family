import { redirect } from 'next/navigation'
import { createClient, getCurrentUserAndAdmin } from '@/lib/supabase/server'
import TreeLayout from '@/components/tree/TreeLayout'
import NotAnAdmin from '@/components/auth/NotAnAdmin'

export default async function EditPage() {
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
    <TreeLayout
      isEditable={true}
      isOwner={admin.role === 'owner'}
      adminName={admin.name ?? user.email ?? ''}
      initialRoots={roots ?? []}
      initialPeople={people ?? []}
      initialPartnerships={partnerships ?? []}
      initialParentChild={parentChild ?? []}
    />
  )
}
