// Lists recordings found in public/recordings (chNN-<name>.mp4 + .json) for src/config.ts.
import { readdirSync, writeFileSync, existsSync } from 'node:fs'

const dir = new URL('../public/recordings/', import.meta.url)
const manifest = {}
if (existsSync(dir)) {
  for (const file of readdirSync(dir)) {
    const match = /^(ch\d{2})-(.+)\.mp4$/.exec(file)
    const base = file.replace(/\.mp4$/, '')
    if (match && existsSync(new URL(`${base}.json`, dir))) manifest[match[1]] = base
  }
}
writeFileSync(
  new URL('../src/recordings.generated.json', import.meta.url),
  JSON.stringify(manifest, null, 2),
)
console.log(
  `recordings: ${Object.keys(manifest).length ? Object.values(manifest).join(', ') : 'none (placeholder)'}`,
)
