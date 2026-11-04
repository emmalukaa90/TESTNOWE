import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // Capacitor ładuje pliki z file-like origin, ścieżki muszą być względne
  build: {
    target: 'es2020',
    outDir: 'dist',
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei', '@react-three/postprocessing', 'postprocessing'],
          physics: ['@react-three/rapier', '@dimforge/rapier3d-compat'],
        },
      },
    },
  },
  server: { host: true, port: 5173 },
});
