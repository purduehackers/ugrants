// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import svelte from "@astrojs/svelte";

import vercel from "@astrojs/vercel";

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

  adapter: vercel(),
});
