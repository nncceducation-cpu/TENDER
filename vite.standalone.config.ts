import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'node:path';

/**
 * Standalone build: the whole application inlined into one HTML file.
 *
 * Purpose is evaluation without a toolchain. Someone with no Node installation
 * can open the file in Chrome and use every clinical screen. The camera layer is
 * unavailable from a file:// origin because getUserMedia requires a secure
 * context, and the app says so rather than failing silently.
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  define: { __TENDER_PUBLIC_DEMO__: 'true' },
  resolve: {
    alias: {
      // The ONNX slot is not reachable in a standalone file. Stub it so the
      // 27 MB runtime is not inlined into an HTML document.
      'onnxruntime-web': resolve(__dirname, 'src/ai/onnxStub.ts'),
      // The cloud assessor is disabled in this build, so the SDK is dead weight.
      '@google/genai': resolve(__dirname, 'src/ai/genaiStub.ts'),
    },
  },
  build: {
    outDir: 'dist-standalone',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
