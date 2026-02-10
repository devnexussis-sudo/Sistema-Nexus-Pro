import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isProduction = mode === 'production';
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          tech: path.resolve(__dirname, 'tech.html'),
        },
      },
      // 🛡️ SECURITY: Remove all console.* in production
      minify: 'esbuild',
      ...(isProduction && {
        esbuild: {
          drop: ['console', 'debugger'], // Remove console.* and debugger statements
        }
      })
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@shared': path.resolve(__dirname, './shared'),
        '@backend': path.resolve(__dirname, './backend'),
      }
    }
  };
});
