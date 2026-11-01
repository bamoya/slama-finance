// Renders the marketing film, its square version, the feature cut-downs and posters into out/.
// Usage: pnpm demo:render [--only=Film] [--no-square] [--crf=24]
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const crf = args.crf ?? '24'
const ids = ['Film', 'Film-Facturation', 'Film-Relances', 'Film-Rapports', 'Film-Modeles'].filter(
  (c) => !args.only || c === args.only,
)
// poster frame per composition: a representative moment (overview for the film, the animation's result for cut-downs)
const posterFrame = {
  Film: 160,
  'Film-Facturation': 470,
  'Film-Relances': 215,
  'Film-Rapports': 130,
  'Film-Modeles': 150,
}
const suffixes = 'no-square' in args ? [''] : ['', '-Square']
mkdirSync('out', { recursive: true })
const run = (a) => execFileSync('npx', ['remotion', ...a], { stdio: 'inherit' })
for (const c of ids)
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
    // poster
    run(['still', 'src/index.ts', id, `out/${id}.png`, `--frame=${posterFrame[c]}`, '--log=error'])
    console.log(`${id}.mp4  ${(statSync(`out/${id}.mp4`).size / 1048576).toFixed(2)} MB`)
  }
