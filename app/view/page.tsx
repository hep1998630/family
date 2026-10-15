import { createClient } from '@/lib/supabase/server'
import TreeApp from '@/components/branch/TreeApp'

export default async function ViewPage({
  searchParams,
}: {
  searchParams: Promise<{ root?: string; focus?: string }>
}) {
  const { root, focus } = await searchParams
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
      isEditable={false}
      initialRoots={roots ?? []}
      initialPeople={people ?? []}
      initialPartnerships={partnerships ?? []}
      initialParentChild={parentChild ?? []}
      initialRootId={root ?? null}
      initialFocusId={focus ?? null}
    />
  )
}
