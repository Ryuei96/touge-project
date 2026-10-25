/**
 * dist-single/index.html（完全な HTML 文書）から、claude.ai Artifact 用のページ断片
 * （<title> + <style> + <div id="root"> + インライン module script）を生成する。
 * 使い方: node scripts/make-artifact-page.mjs <out.html>
 */
import { readFileSync, writeFileSync } from 'node:fs'

const out = process.argv[2]
if (!out) throw new Error('usage: node scripts/make-artifact-page.mjs <out.html>')
const html = readFileSync('dist-single/index.html', 'utf8')
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n')
const scripts = [...html.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]).join('\n')
const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? ''
const bodyWithoutScripts = body.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').trim()
const page = `<title>TOUGE DRIVE WEB</title>
<style>
:root { --bg: #0d1117; --fg: #f2f4f7; color-scheme: dark; }
html, body { height: 100%; margin: 0; background: var(--bg); color: var(--fg); overflow: hidden; }
</style>
${styles}
${bodyWithoutScripts}
${scripts}
`
writeFileSync(out, page)
console.log(`wrote ${out} (${(page.length / 1024 / 1024).toFixed(2)} MB)`)
