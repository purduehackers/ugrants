// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import svelte from "@astrojs/svelte";

import node from "@astrojs/node";

const isDev = process.argv.includes("dev");

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

  adapter: isDev
    ? undefined
    : node({
        mode: "standalone",
      }),
});
