// Local UI evidence only: real React components, synthetic data and explicitly
// replaced Server Actions. This does not load .env or contact Supabase.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(resolve(root, 'package.json'))
const { build } = createRequire(require.resolve('vitest'))('esbuild')
const postcss = createRequire(require.resolve('@tailwindcss/postcss'))('postcss')
const tailwind = require('@tailwindcss/postcss')
const mode = process.argv[2] || 'after'
const source = mode === 'before' ? resolve(process.env.UNIFIED_REVIEW_BASELINE || '/private/tmp/zhuxi-score-before') : root
const port = Number(process.argv[3] || (mode === 'before' ? 3216 : 3217))
const dest = resolve('/tmp/zhuxi-unified-review-visual', mode)
mkdirSync(dest, { recursive: true })

const shims = {
  'next/link': `import React from 'react'; export default function Link({href,children,prefetch,scroll,replace,...props}) {return React.createElement('a',{href:typeof href==='string'?href:'#',...props},children)}`,
  'next/navigation': `export const useRouter=()=>({refresh(){window.__refreshCount=(window.__refreshCount||0)+1},push(href){location.href=href},replace(href){location.href=href}});export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const unstable_rethrow=()=>{};`,
  'next-intl': `const zh=${readFileSync(resolve(source,'src/messages/zh.json'),'utf8')};const ja=${readFileSync(resolve(source,'src/messages/ja.json'),'utf8')};export const useLocale=()=>new URLSearchParams(location.search).get('locale')||'zh';export const useTranslations=(scope)=>{const t=(key,values={})=>{let v=(useLocale()==='ja'?ja:zh);for(const s of [scope,key].filter(Boolean).join('.').split('.'))v=v?.[s];return String(v??key).replace(/\\{(\\w+)\\}/g,(_,k)=>String(values[k]??'{'+k+'}'))};t.has=()=>true;return t};`,
  'server-only': '',
}
function extension(base) {
  for (const ext of ['.tsx', '.ts', '.json', '/index.ts', '/index.tsx']) if (existsSync(base + ext)) return ext
  throw Error('Cannot resolve ' + base)
}
await build({
  entryPoints: [resolve(root, 'scripts/unified-reviews/visual-fixture.txt')], outfile: resolve(dest, 'bundle.js'),
  bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', nodePaths: [resolve(root, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"development"', '__BEFORE__': String(mode === 'before') }, logLevel: 'warning',
  plugins: [{ name: 'registration-review-fixtures', setup(builder) {
    builder.onResolve({ filter: /^(next\/link|next\/navigation|next-intl|server-only)$/ }, (args) => ({ path: args.path, namespace: 'fixture-shim' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture-shim' }, (args) => ({ contents: shims[args.path], loader: 'js', resolveDir: root }))
    builder.onResolve({ filter: /^@\// }, (args) => {
      const base = resolve(source, 'src', args.path.slice(2))
      return { path: base + (/\.(tsx?|json)$/.test(base) ? '' : extension(base)) }
    })
    builder.onLoad({ filter: /visual-fixture\.txt$/ }, (args) => ({ contents: readFileSync(args.path, 'utf8'), loader: 'tsx', resolveDir: root }))
    builder.onLoad({ filter: /\.tsx?$/ }, (args) => {
      const content = readFileSync(args.path, 'utf8')
      if (!/^['"]use server['"]/m.test(content)) return
      const names = [...content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((match) => match[1])
      return { contents: names.map((name) => `export async function ${name}(){throw new Error('Local fixture action was not injected')}`).join('\n'), loader: 'ts' }
    })
  } }],
})
const css = await postcss([tailwind({ base: root })]).process(readFileSync(resolve(root, 'src/app/globals.css'), 'utf8'), { from: resolve(root, 'src/app/globals.css') })
writeFileSync(resolve(dest, 'style.css'), css.css)
writeFileSync(resolve(dest, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>单项互评 · 本地合成界面验收</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/bundle.css"><style>body{margin:0;font-family:Arial,"PingFang SC","Hiragino Sans GB",sans-serif}button,input,textarea,select{font:inherit}</style><div id="root"></div><script type="module" src="/bundle.js"></script></html>`)
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname
  if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return }
  const file = ['bundle.js', 'bundle.css', 'style.css'].find((name) => pathname === '/' + name) || 'index.html'
  res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
  res.setHeader('Cache-Control', 'no-store')
  res.end(readFileSync(resolve(dest, file)))
}).listen(port, '127.0.0.1', () => console.log(`Local unified UI fixture: http://127.0.0.1:${port}`))
