// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import svelte from "@astrojs/svelte";
import sharpService from "astro/assets/services/sharp";

import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  image: {
    service: {
      entrypoint: "@lib/sharpdither.ts",
    },
  },

  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ["canvas"],
    },
    ssr: {
      external: ["canvas"],
    },
  },

  integrations: [svelte()],

  adapter: node({
    mode: "standalone",
  }),
});
