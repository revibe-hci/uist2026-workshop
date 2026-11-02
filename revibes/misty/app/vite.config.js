import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Foldable remix: `npm run dev:phone` serves Misty on the network so a real phone can load it.
// The dev server then forwards /bridge to the LLM bridge, which only listens on this Mac.
//
// Anyone who can reach the server could spend the group's model plan through /bridge, so only
// this Mac, private network addresses, and addresses listed in PHONE_IPS (comma separated)
// get an answer.
const privateRanges = [
  /^127\./, /^::1$/, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^f[cd][0-9a-f]{2}:/i, /^fe80:/i,
];
const allowed = (process.env.PHONE_IPS || '').split(',').map((ip) => ip.trim()).filter(Boolean);

function localOnly() {
  return {
    name: 'misty-local-only',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
        if (allowed.includes(ip) || privateRanges.some((range) => range.test(ip))) return next();
        server.config.logger.warn(`[misty] refused ${ip}: start with PHONE_IPS=${ip} to allow it`);
        res.statusCode = 403;
        res.end(`Misty dev server: ${ip} is not allowed. Add it with PHONE_IPS=${ip}.`);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localOnly()],
  server: {
    proxy: {
      '/bridge': {
        target: process.env.BRIDGE_TARGET || 'http://localhost:8787',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bridge/, ''),
      },
    },
  },
});
