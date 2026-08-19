import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import autoprefixer from 'autoprefixer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
        autoprefixer(),
      ],
    },
  },
  build: {
    // Increase chunk size warning limit (default is 500 KB)
    chunkSizeWarningLimit: 600,
    // Target modern browsers for smaller output
    target: 'es2020',
    rollupOptions: {
      output: {
        // Function-based manualChunks gives Rollup full control over module IDs,
        // fixing the empty vendor-react chunk bug (object form can miss re-exports).
        manualChunks(id) {
          // xlsx is loaded via dynamic import() — keep it in its own async chunk
          // so it's never bundled into the main thread at startup.
          if (id.includes('node_modules/xlsx')) return 'vendor-xlsx';

          // Core React runtime
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'vendor-react';

          // Animation + icon + utility UI libs
          if (
            id.includes('node_modules/framer-motion') ||
            id.includes('node_modules/lucide-react') ||
            id.includes('node_modules/clsx')
          ) return 'vendor-ui';

          // Drag-and-drop
          if (id.includes('node_modules/@dnd-kit')) return 'vendor-dnd';

          // Virtualisation (used only on BoardPage)
          if (id.includes('node_modules/@tanstack')) return 'vendor-table';

          // Date / UUID utilities
          if (id.includes('node_modules/date-fns') || id.includes('node_modules/uuid')) return 'vendor-utils';

          // Supabase client (loaded once, large but rarely changes)
          if (id.includes('node_modules/@supabase')) return 'vendor-supabase';
        },
      },
    },
  },
})
