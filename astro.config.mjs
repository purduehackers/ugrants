// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import svelte from "@astrojs/svelte";
import sharpService from "astro/assets/services/sharp";

// https://astro.build/config
export default defineConfig({
  image: {
    service: {
      entrypoint: "@lib/sharpdither.ts",
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [svelte()],
});
