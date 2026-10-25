/**
 * dist-single/index.html（完全な HTML 文書）から、claude.ai Artifact 用のページ断片
 * （<title> + <style> + <div id="root"> + インライン module script）を生成する。
 * 使い方: node scripts/make-artifact-page.mjs <out.html>
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) throw new Error('usage: node scripts/make-artifact-page.mjs <out.html>')
const html = readFileSync('dist-single/index.html', 'utf8')
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n')
const scripts = [...html.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]).join('\n')
const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? ''
const bodyWithoutScripts = body.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').trim()
// U+FFFD（fast-xml-parser の文字クラスに含まれる）はそのままだと公開時に弾かれるので JS エスケープにする
const escapeReplacement = (s) => s.replace(/\uFFFD/g, '\\uFFFD')
// public/models と public/samples を data: URI として埋め込む（Artifact は GLB/PLY を配信できないため）
const MIME = { glb: 'model/gltf-binary', ply: 'application/octet-stream', gml: 'application/xml', xml: 'application/xml', las: 'application/octet-stream' }
const assets = {}
for (const dir of ['models', 'samples']) {
  for (const name of readdirSync(join('public', dir))) {
    const ext = name.split('.').pop()
    const data = readFileSync(join('public', dir, name))
    assets[`${dir}/${name}`] = `data:${MIME[ext] ?? 'application/octet-stream'};base64,${data.toString('base64')}`
  }
}
const assetScript = `<script>window.__TOUGE_ASSETS=${JSON.stringify(assets)}</script>`

const page = `<meta charset="utf-8">
<title>TOUGE DRIVE WEB</title>
<style>
:root { --bg: #0d1117; --fg: #f2f4f7; color-scheme: dark; }
html, body { height: 100%; margin: 0; background: var(--bg); color: var(--fg); overflow: hidden; }
</style>
${styles}
${bodyWithoutScripts}
${assetScript}
${escapeReplacement(scripts)}
`
writeFileSync(out, page)
console.log(`wrote ${out} (${(page.length / 1024 / 1024).toFixed(2)} MB)`)
