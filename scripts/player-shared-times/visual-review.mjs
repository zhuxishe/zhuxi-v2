// Local-only review of the real player matching page with non-personal fixtures.
// No fixture route or data is served by Next.js, and no Supabase access is used.
// Usage: node scripts/player-shared-times/visual-review.mjs before|after [port]
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(resolve(root, 'package.json'))
const { build } = createRequire(require.resolve('vitest'))('esbuild')
const postcss = createRequire(require.resolve('@tailwindcss/postcss'))('postcss')
const tailwind = require('@tailwindcss/postcss')
const mode = process.argv[2] ?? 'after'
if (!['before', 'after'].includes(mode)) throw new Error('Choose before or after')
const port = Number(process.argv[3] ?? (mode === 'before' ? 3250 : 3251))
const dest = resolve('/private/tmp/zhuxi-player-times-visual', mode)
mkdirSync(dest, { recursive: true })
const baseline = process.env.PLAYER_TIMES_BASELINE || '1ad61a70c346cd28b4fde217ba052c30c1811c52'
const baselineFiles = new Set(['src/app/app/matches/[id]/page.tsx', 'src/components/player/MatchDetailCard.tsx', 'src/lib/matching/publication-display.ts', 'src/messages/zh.json', 'src/messages/ja.json'])
const source = (path) => mode === 'before' && baselineFiles.has(path)
  ? execFileSync('git', ['show', `${baseline}:${path}`], { cwd: root, encoding: 'utf8' })
  : readFileSync(resolve(root, path), 'utf8')
const localization = `const messages={zh:${source('src/messages/zh.json')},ja:${source('src/messages/ja.json')}};
const locale=()=>new URLSearchParams(location.search).get('locale')==='ja'?'ja':'zh';
const translate=scope=>{const t=(key,values={})=>{let value=messages[locale()];for(const part of [scope,key].filter(Boolean).join('.').split('.'))value=value?.[part];return String(value??key).replace(/\\{(\\w+)\\}/g,(_,k)=>String(values[k]??'{'+k+'}'))};t.has=key=>!!messages[locale()]?.[scope]?.[key];return t};`
const shims = {
  'next/link': `import React from 'react';export default function Link({href,children,prefetch,scroll,replace,...props}){return React.createElement('a',{href:typeof href==='string'?href:'#',...props},children)}`,
  'next/navigation': `export const useRouter=()=>({refresh(){window.__timesFixtureRefresh?.()},push(){},replace(){}});export const usePathname=()=>'/app/matches/fixture-match';export const useSearchParams=()=>new URLSearchParams(location.search);export const notFound=()=>{throw Error('Fixture matching record not found')};`,
  'next-intl': `${localization}export const useLocale=locale;export const useTranslations=translate;`,
  'next-intl/server': `${localization}export const getLocale=async()=>locale();export const getTranslations=async scope=>translate(scope);`,
  '@/lib/auth/player': `export async function requirePlayer(){return {memberId:'fixture-viewer'}}`,
  '@/lib/queries/matching': `export async function fetchMatchDetail(){return window.__timesFixtureMatch()}`,
  '@/lib/queries/reviews': `export async function fetchReviewedMatchIds(){return new Set()}`,
  '@/lib/queries/group-members': `export async function fetchGroupMemberNames(ids){return ids.map((id,i)=>({id,name:['林晓','陈语','周宁'][i]??'示例成员'}))}`,
  '@/app/app/matches/[id]/actions': `export async function requestCancellation(data){return window.__timesFixtureSubmit(data)}`,
  'server-only': '',
}
function extension(path) {
  if (existsSync(path) && /\.(tsx?|json)$/.test(path)) return ''
  for (const ext of ['.tsx', '.ts', '.json', '/index.ts', '/index.tsx']) if (existsSync(path + ext)) return ext
  throw new Error(`Cannot resolve fixture import ${path}`)
}
await build({
  entryPoints: [resolve(root, 'scripts/player-shared-times/visual-fixture.txt')], outfile: resolve(dest, 'bundle.js'),
  bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', nodePaths: [resolve(root, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"development"', '__FIXTURE_MODE__': JSON.stringify(mode) },
  plugins: [{ name: 'player-shared-times-review', setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(shims, args.path) ? { path: args.path, namespace: 'review-shim' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'review-shim' }, (args) => ({ contents: shims[args.path], loader: 'js', resolveDir: root }))
    builder.onResolve({ filter: /^@\// }, (args) => { const path = resolve(root, 'src', args.path.slice(2)); return { path: path + extension(path) } })
    builder.onLoad({ filter: /visual-fixture\.txt$/ }, (args) => ({ contents: readFileSync(args.path, 'utf8'), loader: 'tsx', resolveDir: root }))
    builder.onLoad({ filter: /\.tsx?$/ }, (args) => {
      const path = relative(root, args.path).replaceAll('\\', '/')
      if (mode === 'before' && baselineFiles.has(path)) return { contents: source(path), loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: resolve(args.path, '..') }
      if (/^['"]use server['"]/m.test(readFileSync(args.path, 'utf8'))) throw new Error(`Unexpected live server module in fixture: ${path}`)
    })
  } }], logLevel: 'warning',
})
const css = await postcss([tailwind({ base: root })]).process(readFileSync(resolve(root, 'src/app/globals.css'), 'utf8'), { from: resolve(root, 'src/app/globals.css') })
writeFileSync(resolve(dest, 'style.css'), css.css)
writeFileSync(resolve(dest, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>双人共同时段 · ${mode} · 本地验收</title><link rel="stylesheet" href="/style.css"><style>body{margin:0}button,input,textarea{font:inherit}.fixture-shell{max-width:640px;min-height:100vh;margin:0 auto}.fixture-note{padding:12px 24px;border-top:1px solid var(--border);font-size:11px;color:var(--muted-foreground)}</style><div id="root"></div><script type="module" src="/bundle.js"></script></html>`)
http.createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname
  if (path === '/favicon.ico') { response.writeHead(204); response.end(); return }
  const file = path === '/bundle.js' ? 'bundle.js' : path === '/style.css' ? 'style.css' : 'index.html'
  response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
  response.end(readFileSync(resolve(dest, file)))
}).listen(port, '127.0.0.1', () => console.log(`Player time UI ${mode}: http://127.0.0.1:${port} (?locale=ja&scenario=many|few|mixed|past|missing|empty|mismatch|group|ended)`))
