import { defineConfig, type Plugin } from 'vite';
import { copyFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Publish target: the IIS site folder that serves the SPA (D:\OpenTrack-Application\OpenTrack-Web).
// Override per build with: npm run build -- --outDir ../OpenTrack.Api/wwwroot
const outDir = '../../OpenTrack-Web';

// The IIS rewrite rule has to sit next to index.html, but the build empties the output directory, so it is copied
// as part of the build. Without it the static site answers 404 for every client-side route (/bookings, /containers/{id}).
function iisWebConfig(): Plugin {
  let root = '';
  let target = '';
  return {
    name: 'opentrack:iis-web-config',
    configResolved(config) {
      root = config.root;
      target = config.build.outDir;
    },
    closeBundle() {
      const source = join(root, 'deploy', 'web.config');
      if (!existsSync(source)) return;
      // The single-host build emits into the API's wwwroot, where the API serves the SPA itself.
      if (relative(root, target).replace(/\\/g, '/').includes('OpenTrack.Api/wwwroot')) return;
      copyFileSync(source, join(target, 'web.config'));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), iisWebConfig()],
  server: {
    port: 5173,
    // Dev: forward /api to the ASP.NET Core API (dotnet run --urls http://localhost:5080)
    proxy: { '/api': { target: 'https://ot-api.vlogicx.com', changeOrigin: true } },
  },
  // Prod: emit straight into the API's wwwroot so one IIS/Kestrel site serves both
  build: { outDir, emptyOutDir: true },
});
