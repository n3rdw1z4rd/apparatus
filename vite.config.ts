import { defineConfig } from "vite";
import { smoke } from "@n3rdw1z4rd/smoke-ui/vite-plugin";
import wasm from 'vite-plugin-wasm';

export default defineConfig({
    plugins: [smoke()],
    worker: {
        format: 'es',
        plugins: () => [wasm()],
    },
});
