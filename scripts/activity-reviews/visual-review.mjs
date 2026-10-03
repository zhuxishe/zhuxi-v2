// Render the real application components against deterministic, non-personal
// fixtures. Server Actions are replaced explicitly; this is UI evidence, not
// an authenticated production E2E test. No fixture route ships with Next.js.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(resolve(root, 'package.json'))
const vitestRequire = createRequire(require.resolve('vitest'))
const { build } = vitestRequire('esbuild')
const tailwindRequire = createRequire(require.resolve('@tailwindcss/postcss'))
const postcss = tailwindRequire('postcss')
const tailwind = require('@tailwindcss/postcss')
const mode = process.argv[2] || 'after'
const source = mode === 'before' ? resolve(process.env.PEER_REVIEW_BASELINE || '/tmp/zhuxi-peer-review-before') : resolve(process.env.PEER_REVIEW_SOURCE || root)
const port = Number(process.argv[3] || (mode === 'before' ? 3198 : 3199))
const dest = resolve('/tmp/zhuxi-peer-review-visual', mode)
mkdirSync(dest, { recursive: true })
const shims = {
  'next/link': `import React from 'react'; export default function Link({href,children,prefetch,scroll,replace,...props}) {return React.createElement('a',{href:typeof href==='string'?href:'#',...props},children)}`,
  'next/image': `import React from 'react'; export default function Image({priority,unoptimized,fill,sizes,...props}) {return React.createElement('img',props)}`,
  'next/navigation': `export const useRouter=()=>({refresh(){window.__refreshCount=(window.__refreshCount||0)+1},push(href){location.href=href},replace(href){location.href=href}});export const usePathname=()=>new URLSearchParams(location.search).get('screen')?.startsWith('admin')?'/admin/activity-reviews':'/app/matches';export const useSearchParams=()=>new URLSearchParams(location.search);export const notFound=()=>{throw Error('not found')};export const redirect=href=>{location.href=href}`,
  'next-intl': `const zh=${readFileSync(resolve(source,'src/messages/zh.json'),'utf8')};const ja=${readFileSync(resolve(source,'src/messages/ja.json'),'utf8')};export const useLocale=()=>new URLSearchParams(location.search).get('locale')||'zh';export const useTranslations=(scope)=>{const t=(key,values={})=>{let v=(useLocale()==='ja'?ja:zh);for(const s of [scope,key].filter(Boolean).join('.').split('.'))v=v?.[s];return String(v??key).replace(/\{(\w+)\}/g,(_,k)=>String(values[k]??'{'+k+'}'))};t.has=()=>true;return t};`,
  'server-only': '',
}
await build({
  entryPoints: [resolve(root,'scripts/activity-reviews/visual-fixture.txt')], outfile:resolve(dest,'bundle.js'),bundle:true,platform:'browser',format:'esm',jsx:'automatic', sourcemap:false,
  define:{'process.env.NODE_ENV':'"development"','__BEFORE__':String(mode==='before')},
  nodePaths:[resolve(root,'node_modules')],
  plugins:[{name:'review-evidence-fixtures',setup(b){
    b.onResolve({filter:/^(next\/link|next\/image|next\/navigation|next-intl|server-only)$/},args=>({path:args.path,namespace:'fixture-shim'}))
    b.onLoad({filter:/.*/,namespace:'fixture-shim'},args=>({contents:shims[args.path],loader:'js',resolveDir:root}))
    b.onResolve({filter:/^@\//},args=>{let base=resolve(source,'src',args.path.slice(2));if(!existsSync(base)&&!['.tsx','.ts','.json','/index.ts','/index.tsx'].some(ext=>existsSync(base+ext)))base=resolve(root,'src',args.path.slice(2));return {path:base+(/\.(tsx?|json)$/.test(args.path)?'':resolveExtension(base))}})
    b.onResolve({filter:/^@new\//},args=>{const target=process.env.PEER_REVIEW_SOURCE?source:root;return {path:resolve(target,'src',args.path.slice(5))+resolveExtension(resolve(target,'src',args.path.slice(5)))}})
    b.onLoad({filter:/visual-fixture\.txt$/},args=>({contents:readFileSync(args.path,'utf8'),loader:'tsx',resolveDir:root}))
    b.onLoad({filter:/\.tsx?$/},args=>{
      const content=readFileSync(args.path,'utf8')
      if(!/^['"]use server['"]/m.test(content))return
      const names=[...content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(m=>m[1])
      return {contents:names.map(name=>`export async function ${name}(){throw new Error('Fixture action was not injected')}`).join('\n'),loader:'ts'}
    })
  }}],logLevel:'warning',
})
function resolveExtension(path){for(const ext of ['.tsx','.ts','.json','/index.ts','/index.tsx']){try{readFileSync(path+ext);return ext}catch{}}throw Error('Cannot resolve '+path)}
const css = await postcss([tailwind({base:root})]).process(readFileSync(resolve(source,'src/app/globals.css'),'utf8'),{from:resolve(root,'src/app/globals.css')})
writeFileSync(resolve(dest,'style.css'),css.css)
writeFileSync(resolve(dest,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>活动互评界面验收</title><link rel="stylesheet" href="/style.css"><style>body{margin:0;font-family:Arial,"PingFang SC","Hiragino Sans GB",sans-serif}button,input,textarea,select{font:inherit}</style><div id="root"></div><script type="module" src="/bundle.js"></script></html>`)
http.createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname
  if(path==='/favicon.ico'){res.writeHead(204);res.end();return}
  const filename=path==='/bundle.js'?'bundle.js':path==='/style.css'?'style.css':'index.html'
  const file=path==='/logo.svg'?resolve(source,'public/logo.svg'):resolve(dest,filename)
  res.setHeader('Content-Type',path==='/logo.svg'?'image/svg+xml':filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':'text/html')
  res.end(readFileSync(file))
}).listen(port,'127.0.0.1',()=>console.log(`UI fixture ${mode}: http://127.0.0.1:${port}`))
