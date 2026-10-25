import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/** 単一 HTML（JS/CSS インライン）ビルド。配布・プレビュー用。 */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  build: {
    outDir: 'dist-single',
    emptyOutDir: true,
    chunkSizeWarningLimit: 6000,
  },
})
