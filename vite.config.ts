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
    }
});
