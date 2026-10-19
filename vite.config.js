import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * Solo in sviluppo: permette alla pagina di salvare in public/img/ immagini renderizzate dal 3D
 * (copertine della homepage e delle lezioni). POST /__dev/salva?nome=hero.jpg con il file nel corpo.
 */
function devSnapshots() {
  return {
    name: 'dev-snapshots',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/salva', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        const nome = new URL(req.url, 'http://localhost').searchParams.get('nome') || '';
        if (!/^[\w-]+\.(jpe?g|png|webp)$/i.test(nome)) {
          res.statusCode = 400;
          return res.end('nome non valido');
        }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const dir = path.join(root, 'public', 'img');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, nome), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

// `npm run dev`        → http://localhost:5190 (PC)
// `npm run dev:quest`  → https://<IP-del-PC>:5190 in rete locale, per aprirlo dal browser del visore (WebXR richiede HTTPS)
export default defineConfig(({ mode }) => ({
  base: './',
  // il salvataggio delle immagini resta solo sul PC: in modalità quest il server è visibile in rete locale
  plugins: mode === 'quest' ? [basicSsl()] : [devSnapshots()],
  server: {
    port: 5190,
    strictPort: false,
    host: mode === 'quest' ? true : 'localhost',
  },
  preview: { port: 5191 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    sourcemap: false,
    rollupOptions: {
      input: {
        home: path.join(root, 'index.html'),
        tutorial: path.join(root, 'tutorial.html'),
        laboratorio: path.join(root, 'laboratorio.html'),
      },
    },
  },
}));
