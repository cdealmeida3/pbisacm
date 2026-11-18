import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds the whole app (styles, React, core, check packs, sample) into one HTML file with no network access.
export default defineConfig({
  root: 'src/app',
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    modulePreload: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000
  }
});
