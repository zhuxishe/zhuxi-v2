// Real audience-management component; fictitious accounts and local-only actions.
// No application route, database access or network mutation is included.
// Usage: node scripts/round-audience/visual-review.mjs [port]
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(resolve(root, 'package.json'))
const { build } = createRequire(require.resolve('vitest'))('esbuild')
const postcss = createRequire(require.resolve('@tailwindcss/postcss'))('postcss')
const tailwind = require('@tailwindcss/postcss')
const port = Number(process.argv[2] ?? 3261)
const dest = '/private/tmp/zhuxi-round-audience-visual'
mkdirSync(dest, { recursive: true })
const shims = {
  'next/link': `import React from 'react';export default function Link({href,children,prefetch,scroll,replace,...props}){return React.createElement('a',{href:typeof href==='string'?href:'#',...props},children)}`,
  'next/navigation': `export const useRouter=()=>({refresh(){},push(){},replace(){}});export const usePathname=()=>'/admin/matching/rounds/fixture/edit';export const useSearchParams=()=>new URLSearchParams(location.search);`,
  '@/app/admin/matching/rounds/[id]/audience-actions': `export async function loadRoundAudience(...args){return window.__roundAudienceActions.load(...args)};export async function saveRoundAudience(...args){return window.__roundAudienceActions.save(...args)}`,
  'server-only': '',
}
function extension(path) {
  if (existsSync(path) && /\.(tsx?|json)$/.test(path)) return ''
  for (const ext of ['.tsx', '.ts', '.json', '/index.ts', '/index.tsx']) if (existsSync(path + ext)) return ext
  throw new Error(`Cannot resolve fixture import ${path}`)
}
await build({
  entryPoints: [resolve(root, 'scripts/round-audience/visual-fixture.txt')], outfile: resolve(dest, 'bundle.js'),
  bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', nodePaths: [resolve(root, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'round-audience-review', setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(shims, args.path) ? { path: args.path, namespace: 'review-shim' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'review-shim' }, (args) => ({ contents: shims[args.path], loader: 'js', resolveDir: root }))
    builder.onResolve({ filter: /^@\// }, (args) => { const path = resolve(root, 'src', args.path.slice(2)); return { path: path + extension(path) } })
    builder.onLoad({ filter: /visual-fixture\.txt$/ }, (args) => ({ contents: readFileSync(args.path, 'utf8'), loader: 'tsx', resolveDir: root }))
    builder.onLoad({ filter: /\.tsx?$/ }, (args) => {
      if (/^['"]use server['"]/m.test(readFileSync(args.path, 'utf8'))) throw new Error(`Unexpected live server module in fixture: ${args.path}`)
    })
  } }], logLevel: 'warning',
})
const css = await postcss([tailwind({ base: root })]).process(readFileSync(resolve(root, 'src/app/globals.css'), 'utf8'), { from: resolve(root, 'src/app/globals.css') })
writeFileSync(resolve(dest, 'style.css'), css.css)
writeFileSync(resolve(dest, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>参与范围管理 · 本地验收</title><link rel="stylesheet" href="/style.css"><style>body{margin:0}button,input,textarea,select{font:inherit}.fixture-shell{max-width:1440px;margin:0 auto}.fixture-note{font-size:11px;color:var(--muted-foreground)}</style><div id="root"></div><script type="module" src="/bundle.js"></script></html>`)
http.createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname
  if (path === '/favicon.ico') { response.writeHead(204); response.end(); return }
  const file = path === '/bundle.js' ? 'bundle.js' : path === '/style.css' ? 'style.css' : 'index.html'
  response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
  response.end(readFileSync(resolve(dest, file)))
}).listen(port, '127.0.0.1', () => console.log(`Audience UI fixture: http://127.0.0.1:${port} (?mode=allowlist|formal&role=admin&unavailable=1&result=unknown|conflict)`))
