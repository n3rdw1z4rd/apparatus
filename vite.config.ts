import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        wasm(),
    ],
    worker: {
        format: 'es',
        plugins: () => [wasm()],
    },
    server: {
        host: true,
        allowedHosts: ['dev.n3rdw1z4rd.io'],
    },
});
