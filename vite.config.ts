import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import { smoke } from '@n3rdw1z4rd/smoke-ui/vite-plugin';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        smoke(),
        wasm(),
    ],
    worker: {
        format: 'es',
        plugins: () => [wasm()],
    },
    build: {
        target: 'es2022',
        chunkSizeWarningLimit: 2000,
    },
    server: {
        host: true,
        allowedHosts: ['dev.n3rdw1z4rd.io'],
    },
});
