import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Dev: forward /api to the ASP.NET Core API (dotnet run --urls http://localhost:5080)
    proxy: { '/api': { target: 'http://localhost:5080', changeOrigin: true } },
  },
  // Prod: emit straight into the API's wwwroot so one IIS/Kestrel site serves both
  build: { outDir: '../OpenTrack.Api/wwwroot', emptyOutDir: true },
});
