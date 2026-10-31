import { createPublicClient } from '@/lib/supabase/server'
import TreeApp from '@/components/branch/TreeApp'
import { readAll } from '@/lib/supabase/readAll'
import { loadSavedViews } from '@/lib/views-server'

export default async function ViewPage({
  searchParams,
}: {
  searchParams: Promise<{ root?: string; focus?: string; view?: string }>
}) {
  const { root, focus, view } = await searchParams
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
    savedViews,
  ] = await Promise.all([
    // Page by page (the API stops at 1000 rows), in a fixed order: the
    // database otherwise returns rows in whatever order they're stored,
    // which shifts when a row is edited.
    readAll(supabase, 'roots'),
    readAll(supabase, 'people'),
    readAll(supabase, 'partnerships'),
    readAll(supabase, 'parent_child'),
    loadSavedViews(supabase),
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
      initialSavedViews={savedViews}
      initialViewId={view ?? null}
    />
  )
}
