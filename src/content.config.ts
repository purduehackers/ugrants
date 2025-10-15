import { defineCollection, z } from "astro:content";

import { file } from "astro/loaders";

const projects = defineCollection({
  loader: file("src/assets/projects.json"),
  schema: z.object({
    image: z.string(),
    name: z.string(),
    author: z.string(),
    urls: z.object({
      project: z.string().url().optional(),
      author: z.string().url(),
    }),
  }),
});

export const collections = { projects };
