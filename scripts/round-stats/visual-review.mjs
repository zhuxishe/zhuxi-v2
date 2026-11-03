// Real UI components with fictional inputs; no database, auth or write routes.
import {createRequire} from 'node:module'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import http from 'node:http'
const root=fileURLToPath(new URL('../../',import.meta.url))
const require=createRequire(resolve(root,'package.json'))
const {build}=createRequire(require.resolve('vitest'))('esbuild')
const postcss=createRequire(require.resolve('@tailwindcss/postcss'))('postcss')
const tailwind=require('@tailwindcss/postcss')
const port=Number(process.argv[2]||3278)
const dest=resolve('/private/tmp/zhuxi-round-gender-stats-visual')
mkdirSync(dest,{recursive:true})
await build({entryPoints:[resolve(root,'scripts/round-stats/fixture.txt')],outfile:resolve(dest,'bundle.js'),bundle:true,
  platform:'browser',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},nodePaths:[resolve(root,'node_modules')],
  plugins:[{name:'round-stat-fixture',setup(b){
    b.onResolve({filter:/^@\//},args=>{const base=resolve(root,'src',args.path.slice(2));const extension=['.tsx','.ts','/index.ts','/index.tsx'].find(ext=>existsSync(base+ext));if(!extension)throw Error(`Missing source: ${args.path}`);return {path:base+extension}})
    b.onLoad({filter:/fixture\.txt$/},args=>({contents:readFileSync(args.path,'utf8'),loader:'tsx',resolveDir:root}))
  }}],logLevel:'warning'})
const css=await postcss([tailwind({base:root})]).process(readFileSync(resolve(root,'src/app/globals.css'),'utf8'),{from:resolve(root,'src/app/globals.css')})
writeFileSync(resolve(dest,'style.css'),css.css)
writeFileSync(resolve(dest,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>报名统计界面验收</title><link rel="stylesheet" href="/style.css"><style>body{margin:0;font-family:Arial,"PingFang SC","Hiragino Sans GB",sans-serif}</style><div id="root"></div><script type="module" src="/bundle.js"></script></html>')
http.createServer((request,response)=>{const path=new URL(request.url,'http://localhost').pathname;if(path==='/favicon.ico'){response.writeHead(204);response.end();return}
  const filename=path==='/bundle.js'?'bundle.js':path==='/style.css'?'style.css':'index.html'
  response.setHeader('Content-Type',filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':'text/html')
  response.end(readFileSync(resolve(dest,filename)))
}).listen(port,'127.0.0.1',()=>console.log(`Round stats fixture: http://127.0.0.1:${port} (?mode=empty|single)`))
