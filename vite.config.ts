import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // This injects the Vercel Environment Variable into the client-side code
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY)
  }
});