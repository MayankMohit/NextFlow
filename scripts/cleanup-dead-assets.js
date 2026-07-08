// Deletes Asset rows whose file no longer exists (HTTP 404/410) — e.g. old
// Transloadit temporary result URLs from before run outputs were copied to
// Vercel Blob. Conservative: network errors and other statuses keep the row.
//
// Run: node --env-file=.env scripts/cleanup-dead-assets.js           (dry run)
//      node --env-file=.env scripts/cleanup-dead-assets.js --delete  (delete)
const { Client } = require('pg')

async function urlIsDead(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(10000) })
      if (res.status === 404 || res.status === 410) return true
      if (method === 'HEAD' && res.status === 405) continue // host rejects HEAD — retry as GET
      return false
    } catch {
      return false // timeout/DNS hiccup — never delete on uncertainty
    }
  }
  return false
}

;(async () => {
  const doDelete = process.argv.includes('--delete')
  const cs = process.env.DATABASE_URL
  if (!cs) throw new Error('DATABASE_URL is not set (run with --env-file=.env)')
  const client = new Client({
    connectionString: cs,
    ssl: /neon\.tech|sslmode=require/.test(cs) ? { rejectUnauthorized: false } : undefined,
  })
  await client.connect()

  const { rows } = await client.query('SELECT id, type, url FROM "Asset" ORDER BY "createdAt" DESC')
  console.log(`Checking ${rows.length} asset URL(s)...\n`)

  const dead = []
  for (const row of rows) {
    if (await urlIsDead(row.url)) {
      dead.push(row)
      console.log(`  DEAD  ${row.type.padEnd(5)}  ${row.url}`)
    }
  }

  if (dead.length === 0) {
    console.log('No dead assets found.')
  } else if (doDelete) {
    await client.query('DELETE FROM "Asset" WHERE id = ANY($1)', [dead.map(d => d.id)])
    console.log(`\nDeleted ${dead.length} dead asset row(s).`)
  } else {
    console.log(`\n${dead.length} dead asset row(s) found (of ${rows.length}). Rerun with --delete to remove them.`)
  }

  await client.end()
})().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
