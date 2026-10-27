import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import { smoke } from '@n3rdw1z4rd/smoke-ui/vite-plugin';
import { decorators } from '@n3rdw1z4rd/core/vite';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        decorators(), // @component / @field (standard decorators) — Oxc doesn't lower them
        smoke(),
        wasm(),
    ],
    resolve: {
        // core may be linked from ../core (npm link), which has its own three in node_modules:
        // one copy only, or instanceof checks and three's "multiple instances" warning bite
        dedupe: ['three'],
    },
    worker: {
        format: 'es',
        plugins: () => [wasm()],
    },
    build: {
        target: 'es2022',
        chunkSizeWarningLimit: 2000,
        rollupOptions: {
            // two pages: the node graph editor, and the original scene editor (legacy)
            input: { main: 'index.html', legacy: 'legacy.html' },
        },
    },
    server: {
        host: true,
        allowedHosts: ['dev.n3rdw1z4rd.cloud'],
    },
});
