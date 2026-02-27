import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// Plugins de otimização
import { visualizer } from 'rollup-plugin-visualizer';
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills(),

    // Compressão Brotli para produção
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 10240, // Apenas arquivos > 10KB
    }),

    // Compressão Gzip para fallback
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 10240,
    }),

    // Visualizador de bundle (apenas em build)
    process.env.ANALYZE && visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
      filename: './dist/stats.html',
    }),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@services': path.resolve(__dirname, './src/services'),
    },
  },

  build: {
    // Otimizações de build
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // v4: NÃO dropar console — o telemetry.ts gerencia seletivamente
        drop_debugger: true,
        // Remove apenas logs de informação trivial — preserva warn/error para diagnóstico
        pure_funcs: ['console.info', 'console.debug'],
      },
      mangle: {
        safari10: true,
      },
    },

    // Configurações de chunk
    rollupOptions: {
      output: {
        // Separar chunks por vendor
        manualChunks: {
          // React e relacionados
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],

          // UI Components
          'ui-vendor': ['lucide-react'],

          // Data e date handling
          'data-vendor': ['@supabase/supabase-js', 'date-fns'],

          // Maps (se usado)
          'map-vendor': ['leaflet', 'react-leaflet'],

          // Forms e validação
          'form-vendor': ['zod'],

          // Utilities
          'utils-vendor': ['dompurify'],
        },

        // Nomes de arquivo com hash para cache busting
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },

    // Tamanho máximo de chunk (500KB)
    chunkSizeWarningLimit: 500,

    // Source maps para produção (ajuda em debug)
    sourcemap: process.env.NODE_ENV === 'production' ? 'hidden' : true,

    // Otimização CSS
    cssCodeSplit: true,
    cssMinify: true,
  },

  // Otimizações de desenvolvimento
  server: {
    port: 3000,
    host: true,

    // HMR otimizado
    hmr: {
      overlay: true,
    },

    // Proxy (se necessário)
    // proxy: {
    //   '/api': {
    //     target: 'http://localhost:54321',
    //     changeOrigin: true,
    //   },
    // },
  },

  // Otimizações de preview
  preview: {
    port: 4173,
    host: true,
  },

  // Cache otimizado
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@supabase/supabase-js',
      'date-fns',
      'zod',
    ],
    exclude: ['@vite/client', '@vite/env'],
  },

  // Configurações de performance
  esbuild: {
    // Remove comentários em produção
    legalComments: 'none',

    // Otimizações
    treeShaking: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
  },
});
