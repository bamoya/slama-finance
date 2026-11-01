// Renders every composition to out/: mp4 (H.264), poster PNG, optional webm (--webm).
// Usage: pnpm render:all [--only=Chapter-05-Devis] [--square] [--webm] [--crf=22]
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const crf = args.crf ?? '22'
const ids = [...Array.from({ length: 9 }, (_, i) => `Chapter-0${i + 1}`), 'Visite-complete']
const names = {
  'Chapter-01': 'Chapter-01-Compte',
  'Chapter-02': 'Chapter-02-Organisation',
  'Chapter-03': 'Chapter-03-Client',
  'Chapter-04': 'Chapter-04-Modeles',
  'Chapter-05': 'Chapter-05-Devis',
  'Chapter-06': 'Chapter-06-Facture',
  'Chapter-07': 'Chapter-07-Encaissement',
  'Chapter-08': 'Chapter-08-Equipe',
  'Chapter-09': 'Chapter-09-Rapports',
}
const comps = ids.map((i) => names[i] ?? i).filter((c) => !args.only || c === args.only)
const suffixes = args.square
  ? ['-Square']
  : 'no-square' in args
    ? ['']
    : ['', '-Square']
mkdirSync('out', { recursive: true })
const run = (a) => execFileSync('npx', ['remotion', ...a], { stdio: 'inherit' })
const stillFrame = (c) => (c.startsWith('Visite') ? 60 : 75)

for (const c of comps) {
  for (const s of suffixes) {
    const id = c + s
    run([
      'render',
      'src/index.ts',
      id,
      `out/${id}.mp4`,
      '--codec=h264',
      `--crf=${crf}`,
      '--pixel-format=yuv420p',
      '--log=error',
    ])
    run(['still', 'src/index.ts', id, `out/${id}.png`, `--frame=${stillFrame(c)}`, '--log=error'])
    if ('webm' in args)
      run([
        'render',
        'src/index.ts',
        id,
        `out/${id}.webm`,
        '--codec=vp9',
        '--crf=34',
        '--log=error',
      ])
    console.log(`${id}.mp4  ${(statSync(`out/${id}.mp4`).size / 1048576).toFixed(2)} MB`)
  }
}
