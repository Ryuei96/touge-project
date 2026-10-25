/**
 * アセット URI の解決。
 * 通常は public/ 配下の相対パスをそのまま使う。単一 HTML 配布（Artifact 等）では
 * window.__TOUGE_ASSETS に data: URI を埋め込んでおくと、同じコードがそちらを使う。
 */
declare global {
  interface Window {
    __TOUGE_ASSETS?: Record<string, string>
  }
}

export function resolveAssetUri(uri: string): string {
  if (typeof window !== 'undefined') {
    const embedded = window.__TOUGE_ASSETS?.[uri]
    if (embedded) return embedded
  }
  return uri
}
