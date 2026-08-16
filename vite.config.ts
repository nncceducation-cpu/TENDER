import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * TENDER_BASE is set by the Pages workflow to the project sub-path ("/TENDER/").
 * Locally it is unset and the application is served from the root.
 *
 * TENDER_PUBLIC_DEMO turns on the pre-release banner. It is on for the public
 * deployment and off for a local run, because a banner a nurse sees every shift
 * stops being read, while one a first-time visitor sees needs to be unmissable.
 */
export default defineConfig({
  base: process.env.TENDER_BASE ?? '/',
  define: {
    __TENDER_PUBLIC_DEMO__: JSON.stringify(process.env.TENDER_PUBLIC_DEMO === 'true'),
  },
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
