/**
 * アセット URI の解決。
 * 通常は public/ 配下の相対パスをそのまま使う。単一 HTML 配布（Artifact 等）では
 * window.__TOUGE_ASSETS に data: URI を埋め込んでおくと、同じコードがそちらを使う。
 */
export interface DesktopFile {
  name: string
  ext: string
  size: number
  dataUrl: string
}

/** Electron 版（desktop/preload.cjs）が公開する API。Web 版では undefined */
export interface TougeDesktopApi {
  version: string
  platform: string
  pickModel(): Promise<DesktopFile | null>
  pickLayer(): Promise<DesktopFile | null>
  onOpenModel(cb: () => void): void
  onOpenLayer(cb: () => void): void
}

declare global {
  interface Window {
    __TOUGE_ASSETS?: Record<string, string>
    tougeDesktop?: TougeDesktopApi
  }
}

export const isDesktop = (): boolean => typeof window !== 'undefined' && !!window.tougeDesktop

export function resolveAssetUri(uri: string): string {
  if (typeof window !== 'undefined') {
    const embedded = window.__TOUGE_ASSETS?.[uri]
    if (embedded) return embedded
  }
  return uri
}
