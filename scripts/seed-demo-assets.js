// Uploads the sample-workflow demo assets from public/demo/ to Vercel Blob at
// STABLE paths (no random suffix), so the URLs can be hardcoded in
// src/lib/sampleWorkflow.ts. Rerun after replacing the files in public/demo/.
//
// Run: node --env-file=.env scripts/seed-demo-assets.js
const fs = require('node:fs')
const path = require('node:path')
const { put } = require('@vercel/blob')

const DEMO_DIR = path.join(__dirname, '..', 'public', 'demo')

const FILES = [
  { name: 'demo-product.webp', contentType: 'image/webp', label: 'DEMO_IMAGE_URL' },
  { name: 'demo-video.mp4', contentType: 'video/mp4', label: 'DEMO_VIDEO_URL' },
]

;(async () => {
  console.log('Uploading demo assets to Vercel Blob...\n')
  for (const f of FILES) {
    const filePath = path.join(DEMO_DIR, f.name)
    if (!fs.existsSync(filePath)) throw new Error(`Missing file: ${filePath}`)
    const buffer = fs.readFileSync(filePath)
    const blob = await put(`demo/${f.name}`, buffer, {
      access: 'public',
      contentType: f.contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    })
    console.log(`  ${f.label} = ${blob.url}  (${(buffer.length / 1024).toFixed(0)} KB)`)
  }
  console.log('\nDone. Paste the URLs into src/lib/sampleWorkflow.ts if they changed.')
})().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
