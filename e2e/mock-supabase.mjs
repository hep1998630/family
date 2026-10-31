// A fake Supabase (auth + PostgREST + storage subset) for local e2e checks,
// so they never touch the real project. Holds everything in memory.
import http from 'node:http'

export const TOKEN = 'mock-access-token'
/** Like the Supabase API's "max rows": no request returns more. */
export const MAX_ROWS = 1000
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
export const USER = { id: '00000000-0000-4000-8000-0000000000aa', email: 'owner@example.com', aud: 'authenticated', role: 'authenticated' }

/**
 * Starts the fake on `port` with `seed` rows; resolves to the http.Server.
 * `missingTables` answer like a table whose migration hasn't been run.
 * `refuse` lists writes RLS refuses, e.g. [['parent_child', 'DELETE']]: like
 * the real database they "succeed" while changing 0 rows.
 */
export function startMockSupabase({ port = 54321, seed = {}, missingTables = [], refuse = [], photoDelayMs = 0 } = {}) {
  const refused = (table, method) => refuse.some(([t, m]) => t === table && m === method)
  const PORT = port
  const db = {
    roots: seed.roots ?? [],
    people: seed.people ?? [],
    partnerships: seed.partnerships ?? [],
    parent_child: seed.parent_child ?? [],
    saved_views: seed.saved_views ?? [],
    admins: seed.admins ?? [{ id: USER.id, role: 'owner', name: 'المالك', created_at: new Date().toISOString() }],
  }
  const UNIQUE = {
    roots: [['id']], people: [['id']], admins: [['id']],
    partnerships: [['id'], ['person_a_id', 'person_b_id']],
    parent_child: [['id'], ['parent_id', 'child_id']],
    saved_views: [['id']],
  }
  // storage: "bucket/path" → { body, type }
  const files = new Map(Object.entries(seed.files ?? {}))
  const failures = [] // { table, method, mode: 'before'|'after' }
  const log = []      // every write, for assertions

  const now = () => new Date().toISOString()
  const parseVal = v => (v === 'null' ? null : v)

  function parseCond(c) {
    const [col, op, ...rest] = c.split('.')
    const val = parseVal(rest.join('.'))
    if (op === 'eq') return r => String(r[col]) === String(val)
    if (op === 'is') return r => r[col] === null
    if (op === 'in') { const set = val.replace(/[()]/g, '').split(','); return r => set.includes(String(r[col])) }
    return () => true
  }
  function parseOr(expr) {
    let e = expr.trim()
    if (e.startsWith('(') && e.endsWith(')')) e = e.slice(1, -1)
    const groups = [...e.matchAll(/and\(([^)]*)\)/g)].map(m => m[1])
    if (groups.length) {
      const ands = groups.map(g => g.split(',').map(parseCond))
      return r => ands.some(fs => fs.every(f => f(r)))
    }
    const ors = e.split(',').map(parseCond)
    return r => ors.some(f => f(r))
  }
  function filtersFrom(url) {
    const fs = []
    for (const [k, v] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue
      if (k === 'or') fs.push(parseOr(v))
      else fs.push(parseCond(`${k}.${v}`))
    }
    return r => fs.every(f => f(r))
  }

  function send(res, status, body, headers = {}) {
    res.writeHead(status, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS,PUT,HEAD',
      'Access-Control-Expose-Headers': '*',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    })
    res.end(body !== undefined ? JSON.stringify(body) : undefined)
  }

  function readBody(req) {
    return new Promise(resolve => {
      const chunks = []
      req.on('data', c => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks)))
    })
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    if (req.method === 'OPTIONS') return send(res, 204)
    const raw = await readBody(req)

    // ── control endpoints for the test driver ──
    if (url.pathname === '/__mock/state') return send(res, 200, { db, log, files: [...files.keys()] })
    if (url.pathname === '/__mock/fail') { failures.push(JSON.parse(raw.toString())); return send(res, 200, { ok: true }) }

    // ── auth ──
    if (url.pathname === '/auth/v1/user') {
      const auth = req.headers.authorization ?? ''
      return auth === `Bearer ${TOKEN}` ? send(res, 200, USER) : send(res, 401, { message: 'invalid JWT', code: 'bad_jwt' })
    }
    if (url.pathname === '/auth/v1/logout') return send(res, 204)
    if (url.pathname.startsWith('/auth/v1/')) return send(res, 404, { message: 'not mocked' })

    // ── storage: public photos. Only files that were seeded (seed.files) or
    //    uploaded — and not deleted since — exist; anything else is a 404,
    //    like the real bucket. (Query strings such as ?cacheNonce= are ignored.) ──
    if (req.method === 'GET' && url.pathname.startsWith('/storage/v1/object/public/')) {
      await new Promise(r => setTimeout(r, photoDelayMs))
      const stored = files.get(decodeURIComponent(url.pathname.replace('/storage/v1/object/public/', '')))
      if (!stored) return send(res, 404, { message: 'Object not found' })
      res.writeHead(200, { 'Content-Type': stored.type, 'Access-Control-Allow-Origin': '*' })
      return res.end(stored.body)
    }
    // Upload (supabase-js sends a File as multipart form data).
    if ((req.method === 'POST' || req.method === 'PUT') && url.pathname.startsWith('/storage/v1/object/')) {
      const key = decodeURIComponent(url.pathname.replace('/storage/v1/object/', ''))
      log.push({ table: 'storage', method: req.method, path: key })
      const type = req.headers['content-type'] ?? ''
      let body = raw, fileType = type
      if (type.startsWith('multipart/form-data')) {
        const form = await new Response(raw, { headers: { 'content-type': type } }).formData()
        const file = [...form.values()].find(v => typeof v !== 'string')
        body = Buffer.from(await file.arrayBuffer())
        fileType = file.type || 'application/octet-stream'
      }
      files.set(key, { body, type: fileType })
      return send(res, 200, { Key: key })
    }
    // Remove: DELETE /storage/v1/object/<bucket> with { prefixes: [paths] }.
    if (req.method === 'DELETE' && url.pathname.startsWith('/storage/v1/object/')) {
      const bucket = url.pathname.replace('/storage/v1/object/', '')
      const { prefixes = [] } = JSON.parse(raw.toString() || '{}')
      log.push({ table: 'storage', method: 'DELETE', paths: prefixes })
      const gone = prefixes.filter(p => files.delete(`${bucket}/${p}`))
      return send(res, 200, gone.map(name => ({ name, bucket_id: bucket })))
    }

    // ── RPC: the role checks from 003_add_auth_roles.sql ──
    // ── RPC: delete_person (007) — all or nothing, like the real function ──
    if (url.pathname === '/rest/v1/rpc/delete_person') {
      log.push({ table: 'rpc', method: 'delete_person', body: raw.toString() })
      const fi = failures.findIndex(f => f.table === 'rpc' && f.method === 'delete_person')
      if (fi !== -1) {
        failures.splice(fi, 1)
        return send(res, 500, { message: 'injected delete_person failure', code: 'XX000' })
      }
      const signedIn = (req.headers.authorization ?? '') === `Bearer ${TOKEN}`
      const me = signedIn ? db.admins.find(a => a.id === USER.id) : null
      const { p_id: id } = JSON.parse(raw.toString() || '{}')
      if (!db.people.some(p => p.id === id)) return send(res, 204)
      if (me?.role !== 'owner') return send(res, 403, { message: 'only the owner can delete people', code: '42501' })
      const ids = db.people.filter(p => p.id === id || p.original_person_id === id).map(p => p.id)
      if (db.parent_child.some(r => ids.includes(r.parent_id)) || db.people.some(p => ids.includes(p.mother_id) && !ids.includes(p.id))) {
        return send(res, 400, { message: 'this person still has children — remove or move them first', code: '23503' })
      }
      db.partnerships = db.partnerships.filter(r => !ids.includes(r.person_a_id) && !ids.includes(r.person_b_id))
      db.parent_child = db.parent_child.filter(r => !ids.includes(r.child_id))
      db.people = db.people.filter(p => !ids.includes(p.id))
      return send(res, 204)
    }

    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(is_owner|is_admin)$/)
    if (rpc) {
      const signedIn = (req.headers.authorization ?? '') === `Bearer ${TOKEN}`
      const me = signedIn ? db.admins.find(a => a.id === USER.id) : null
      return send(res, 200, rpc[1] === 'is_owner' ? me?.role === 'owner' : !!me)
    }

    // ── PostgREST ──
    const m = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)
    if (!m) return send(res, 404, { message: `no route ${url.pathname}` })
    const table = m[1]
    if (!db[table] || missingTables.includes(table)) {
      return send(res, 404, { message: `Could not find the table 'public.${table}' in the schema cache`, code: 'PGRST205' })
    }
    const match = filtersFrom(url)
    const accept = req.headers.accept ?? ''
    const prefer = req.headers.prefer ?? ''

    const fi = req.method === 'GET' ? -1 : failures.findIndex(f => f.table === table && f.method === req.method)
    const failure = fi === -1 ? null : failures.splice(fi, 1)[0]

    // Like 005_saved_views.sql's trigger: the partner must be a partner of the top person.
    if (table === 'saved_views' && (req.method === 'POST' || req.method === 'PATCH')) {
      const input = JSON.parse(raw.toString() || '{}')
      const rows = req.method === 'POST' ? [].concat(input) : db.saved_views.filter(match).map(r => ({ ...r, ...input }))
      const bad = rows.find(r => r.partner_id && !db.partnerships.some(p =>
        (p.person_a_id === r.top_person_id && p.person_b_id === r.partner_id) ||
        (p.person_b_id === r.top_person_id && p.person_a_id === r.partner_id)))
      if (bad) return send(res, 400, { message: `saved view partner ${bad.partner_id} is not a partner of ${bad.top_person_id}`, code: '23514' })
    }

    if (failure?.mode === 'before') return send(res, 500, { message: `injected ${req.method} failure on ${table}`, code: 'XX000' })

    let status = 200, body
    if (req.method === 'GET' || req.method === 'HEAD') {
      let rows = db[table].filter(match)
      // order=a.asc,b.desc — several keys, like PostgREST.
      const keys = (url.searchParams.get('order') ?? '').split(',').filter(Boolean).map(k => k.split('.'))
      if (keys.length) {
        rows = [...rows].sort((a, b) => {
          for (const [col, dir] of keys) {
            const x = String(a[col]), y = String(b[col])
            if (x !== y) return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1)
          }
          return 0
        })
      }
      // offset/limit (what .range() sends), and the API's 1000-row cap.
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Math.min(Number(url.searchParams.get('limit') ?? MAX_ROWS), MAX_ROWS)
      rows = rows.slice(offset, offset + limit)
      if (accept.includes('vnd.pgrst.object')) {
        if (rows.length !== 1) return send(res, 406, { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' })
        body = rows[0]
      } else body = rows
    } else if (req.method === 'POST') {
      const input = JSON.parse(raw.toString() || '[]')
      const rows = Array.isArray(input) ? input : [input]
      const inserted = []
      for (const r of rows) {
        const row = { created_at: now(), ...(table === 'roots' || table === 'people' ? { updated_at: now() } : {}), ...r }
        if (!row.id) row.id = crypto.randomUUID()
        const clash = (UNIQUE[table] ?? []).some(cols => db[table].some(x => cols.every(c => x[c] === row[c])))
        if (clash) return send(res, 409, { message: 'duplicate key value violates unique constraint', code: '23505' })
        db[table].push(row); inserted.push(row)
        log.push({ table, method: 'POST', row })
      }
      status = 201
      body = prefer.includes('return=representation') ? (accept.includes('vnd.pgrst.object') ? inserted[0] : inserted) : undefined
    } else if (req.method === 'PATCH') {
      const patch = JSON.parse(raw.toString() || '{}')
      const rows = refused(table, 'PATCH') ? [] : db[table].filter(match)
      rows.forEach(r => Object.assign(r, patch))
      log.push({ table, method: 'PATCH', patch, count: rows.length })
      status = prefer.includes('return=representation') ? 200 : 204
      body = status === 200 ? (accept.includes('vnd.pgrst.object') ? rows[0] : rows) : undefined
    } else if (req.method === 'DELETE') {
      const gone = refused(table, 'DELETE') ? [] : db[table].filter(match)
      db[table] = db[table].filter(r => !gone.includes(r))
      log.push({ table, method: 'DELETE', count: gone.length })
      status = prefer.includes('return=representation') ? 200 : 204
      body = status === 200 ? gone : undefined
    }

    if (failure?.mode === 'after') return send(res, 500, { message: `injected lost response for ${req.method} on ${table}`, code: 'XX000' })
    return status === 204 ? send(res, 204) : send(res, status, body)
  })

  return new Promise(resolve => server.listen(PORT, () => resolve(server)))
}
