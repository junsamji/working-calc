import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base:'/working-calc/',
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(process.env.GEMINI_API_KEY ?? env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY ?? env.GEMINI_API_KEY),
		    'process.env.DB_KEY': JSON.stringify(process.env.DB_API_KEY ?? env.DB_API_KEY),
		    'process.env.AUTH_KEY': JSON.stringify(process.env.AUTH_KEY ?? env.AUTH_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
