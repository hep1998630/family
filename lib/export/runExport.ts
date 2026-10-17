// lib/export/runExport.ts
//
// Builds and downloads family-export-YYYY-MM-DD.zip in the browser. Only
// imported when «تصدير العائلة» is pressed, so JSZip never weighs on the
// normal page. Runs in the browser (not a server function) because
// downloading every photo can take longer than a free-plan function may run.

import JSZip from 'jszip'
import { createClient } from '@/lib/supabase/client'
import {
  buildFamilyExport, buildGedcom, buildReadme, photoPath, photoTargets,
  type FamilyData, type PhotoResult,
} from '@/lib/export/familyExport'

export type ExportProgress =
  | { stage: 'data' }
  | { stage: 'photos'; done: number; total: number }
  | { stage: 'zip' }

export interface ExportResult {
  fileName: string
  people: number
  photos: number
  missingPhotos: number
}

const PHOTO_CONCURRENCY = 4

export async function runFamilyExport(onProgress: (p: ExportProgress) => void): Promise<ExportResult> {
  // 1. Fresh saved data from the database (not the edit-mode draft).
  onProgress({ stage: 'data' })
  const supabase = createClient()
  const [roots, people, partnerships, parentChild] = await Promise.all([
    supabase.from('roots').select('*').order('created_at').order('id'),
    supabase.from('people').select('*').order('created_at').order('id'),
    supabase.from('partnerships').select('*').order('created_at').order('id'),
    supabase.from('parent_child').select('*').order('created_at').order('id'),
  ])
  for (const r of [roots, people, partnerships, parentChild]) if (r.error) throw new Error(r.error.message)
  const data: FamilyData = {
    roots: roots.data ?? [], people: people.data ?? [],
    partnerships: partnerships.data ?? [], parentChild: parentChild.data ?? [],
  }

  // 2. Photos — a failed one is recorded, never fatal.
  const zip = new JSZip()
  const targets = photoTargets(data)
  const photos = new Map<string, PhotoResult>()
  let done = 0
  onProgress({ stage: 'photos', done, total: targets.length })
  const queue = [...targets]
  await Promise.all(Array.from({ length: Math.min(PHOTO_CONCURRENCY, queue.length) }, async () => {
    for (let target = queue.shift(); target; target = queue.shift()) {
      try {
        const res = await fetch(target.url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const path = photoPath(target.personId, target.url, res.headers.get('content-type'))
        // Photos are already compressed; storing them is faster and no bigger.
        zip.file(path, await res.blob(), { compression: 'STORE' })
        photos.set(target.personId, { path })
      } catch {
        photos.set(target.personId, { missingUrl: target.url })
      }
      onProgress({ stage: 'photos', done: ++done, total: targets.length })
    }
  }))

  // 3. The data files.
  onProgress({ stage: 'zip' })
  const exp = buildFamilyExport(data, photos, new Date())
  zip.file('family.json', JSON.stringify(exp, null, 2))
  zip.file('family.ged', buildGedcom(exp))
  zip.file('README.txt', buildReadme(exp))
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })

  // 4. Download.
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fileName = `family-export-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)

  const missing = [...photos.values()].filter(p => 'missingUrl' in p).length
  return { fileName, people: exp.people.length, photos: photos.size - missing, missingPhotos: missing }
}
