import { createPublicClient } from '@/lib/supabase/server'
import TreeApp from '@/components/branch/TreeApp'

export default async function ViewPage({
  searchParams,
}: {
  searchParams: Promise<{ root?: string; focus?: string }>
}) {
  const { root, focus } = await searchParams
  const supabase = createPublicClient()

  // Fetch all data server-side for initial render (SSR) — public reads,
  // no session needed (see createPublicClient's doc comment). Using the
  // plain anon-key client here also means a visitor who happens to have
  // a stale admin session cookie can never trigger a refresh attempt
  // just by loading the public /view page.
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
