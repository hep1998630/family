// lib/draft/mockSupabase.ts
//
// A tiny in-memory stand-in for the parts of the Supabase client that
// lib/draft/saveQueue.ts uses, with failure injection — test-only.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type Row = Record<string, unknown>
type Filter = (r: Row) => boolean

/**
 * 'before' — the request fails and nothing is written.
 * 'after'  — the row IS written but the client still sees an error
 *            (a lost response), the case that makes naive retries
 *            create duplicates.
 */
export type FailureMode = 'before' | 'after'

const UNIQUE_KEYS: Record<string, string[][]> = {
  roots: [['id']],
  people: [['id']],
  partnerships: [['id'], ['person_a_id', 'person_b_id']],
  parent_child: [['id'], ['parent_id', 'child_id']],
}

/** What getPublicUrl returns, shaped like a real Supabase photo URL. */
export const PUBLIC_URL = 'https://cdn.example/storage/v1/object/public/avatars/'

export function createMockDb() {
  const tables: Record<string, Row[]> = { roots: [], people: [], partnerships: [], parent_child: [] }
  const failures: { table: string; op: string; mode: FailureMode }[] = []
  // Like RLS: a refused update/delete doesn't error, it just touches 0 rows.
  const refused = new Set<string>()
  let isOwner = true
  const uploads: string[] = []
  const removed: string[] = []
  let storageFailures = 0

  const takeFailure = (table: string, op: string) => {
    const i = failures.findIndex(f => f.table === table && f.op === op)
    if (i === -1) return null
    return failures.splice(i, 1)[0]
  }

  const parseOr = (expr: string): Filter => {
    const cond = (c: string): Filter => {
      const [col, , ...rest] = c.split('.')
      const val = rest.join('.')
      return r => r[col] === val
    }
    const groups = [...expr.matchAll(/and\(([^)]*)\)/g)].map(m => m[1])
    if (groups.length > 0) {
      const ands = groups.map(g => g.split(',').map(cond))
      return r => ands.some(fs => fs.every(f => f(r)))
    }
    const ors = expr.split(',').map(cond)
    return r => ors.some(f => f(r))
  }

  class Query {
    private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    private payload: Row = {}
    private filters: Filter[] = []
    private limitN = Infinity
    private returning = false
    constructor(private table: string) {}
    select() {
      // After update/delete, .select() asks for the affected rows back.
      if (this.op === 'update' || this.op === 'delete') this.returning = true
      else if (this.op !== 'insert') this.op = 'select'
      return this
    }
    insert(row: Row) { this.op = 'insert'; this.payload = row; return this }
    update(v: Row) { this.op = 'update'; this.payload = v; return this }
    delete() { this.op = 'delete'; return this }
    eq(col: string, val: unknown) { this.filters.push(r => r[col] === val); return this }
    or(expr: string) { this.filters.push(parseOr(expr)); return this }
    limit(n: number) { this.limitN = n; return this }
    then<T>(resolve: (v: { data: unknown; error: { message: string; code?: string } | null }) => T, reject?: (e: unknown) => T) {
      return Promise.resolve().then(() => this.exec()).then(resolve, reject)
    }
    private exec() {
      const rows = tables[this.table]
      const match = (r: Row) => this.filters.every(f => f(r))
      const failure = this.op === 'select' ? null : takeFailure(this.table, this.op)
      if (failure?.mode === 'before') {
        return { data: null, error: { message: `injected ${this.op} failure on ${this.table}` } }
      }

      let result: { data: unknown; error: { message: string; code?: string } | null }
      if (this.op === 'insert') {
        const clash = (UNIQUE_KEYS[this.table] ?? []).some(cols =>
          rows.some(r => cols.every(c => r[c] === this.payload[c])))
        if (clash) {
          result = { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } }
        } else {
          rows.push({ ...this.payload })
          result = { data: null, error: null }
        }
      } else if (this.op === 'update') {
        const hit = refused.has(`${this.table}:update`) ? [] : rows.filter(match)
        hit.forEach(r => Object.assign(r, this.payload))
        result = { data: this.returning ? hit.map(r => ({ id: r.id })) : null, error: null }
      } else if (this.op === 'delete') {
        const hit = refused.has(`${this.table}:delete`) ? [] : rows.filter(match)
        tables[this.table] = rows.filter(r => !hit.includes(r))
        result = { data: this.returning ? hit.map(r => ({ id: r.id })) : null, error: null }
      } else {
        result = { data: rows.filter(match).slice(0, this.limitN).map(r => ({ ...r })), error: null }
      }

      if (failure?.mode === 'after') {
        return { data: null, error: { message: `injected lost response for ${this.op} on ${this.table}` } }
      }
      return result
    }
  }

  const client = {
    from: (table: string) => new Query(table),
    rpc: async (fn: string, args: Record<string, string> = {}) => {
      if (fn === 'is_owner') return { data: isOwner, error: null }
      if (fn !== 'delete_person') return { data: null, error: { message: `no rpc ${fn}` } }
      // Like migration 007's delete_person: all or nothing.
      const failure = takeFailure('rpc', 'delete_person')
      if (failure?.mode === 'before') return { data: null, error: { message: 'injected delete_person failure' } }
      const id = args.p_id
      if (tables.people.some(p => p.id === id)) {
        if (!isOwner) return { data: null, error: { message: 'only the owner can delete people', code: '42501' } }
        const ids = tables.people.filter(p => p.id === id || p.original_person_id === id).map(p => p.id)
        if (tables.parent_child.some(r => ids.includes(r.parent_id as string))
          || tables.people.some(p => ids.includes(p.mother_id as string) && !ids.includes(p.id as string))) {
          return { data: null, error: { message: 'this person still has children', code: '23503' } }
        }
        tables.partnerships = tables.partnerships.filter(r => !ids.includes(r.person_a_id as string) && !ids.includes(r.person_b_id as string))
        tables.parent_child = tables.parent_child.filter(r => !ids.includes(r.child_id as string))
        tables.people = tables.people.filter(p => !ids.includes(p.id as string))
      }
      if (failure?.mode === 'after') return { data: null, error: { message: 'injected lost response for delete_person' } }
      return { data: null, error: null }
    },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          if (storageFailures > 0) {
            storageFailures -= 1
            return { error: { message: 'injected upload failure' } }
          }
          uploads.push(path)
          return { error: null }
        },
        remove: async (paths: string[]) => {
          removed.push(...paths)
          return { data: paths.map(name => ({ name })), error: null }
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `${PUBLIC_URL}${path}` } }),
      }),
    },
  } as unknown as SupabaseClient<Database>

  return {
    client,
    tables,
    uploads,
    removed,
    failNext: (table: string, op: string, mode: FailureMode = 'before') => failures.push({ table, op, mode }),
    failNextUpload: () => { storageFailures += 1 },
    /** Make `op` on `table` silently affect 0 rows, as RLS does for a refused write. */
    refuse: (table: string, op: 'update' | 'delete') => refused.add(`${table}:${op}`),
    /** Log in as an editor (not the owner): is_owner() returns false. */
    actAsEditor: () => { isOwner = false },
  }
}
