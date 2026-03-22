import { defineConfig } from 'vite';
// import preact from '@preact/preset-vite';
import wasm from 'vite-plugin-wasm';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        wasm(),
        // preact(),
    ],
});
