import { defineCollection, z } from "astro:content";
import staticProjects from "./assets/projects.json";

const projects = defineCollection({
  loader: async () => {
    const staticEntries = staticProjects.map((p) => ({
      ...p,
      imageUrl: null as string | null,
    }));

    const cmsUrl = import.meta.env.CMS_URL ?? process.env.CMS_URL;
    if (!cmsUrl) return staticEntries;

    try {
      const res = await fetch(
        `${cmsUrl}/api/ugrants?where[visible][equals]=true&depth=1&limit=100`,
      );
      if (!res.ok) return staticEntries;

      const { docs } = await res.json();
      const cmsEntries = docs.map((doc: any) => ({
        id: String(doc.id),
        name: doc.name,
        author: doc.author,
        description: doc.description,
        image: undefined as string | undefined,
        imageUrl: (doc.image?.url as string) ?? null,
        urls: {
          author: doc.authorUrl ?? undefined,
          project: doc.projectUrl ?? undefined,
        },
      }));

      return [...cmsEntries, ...staticEntries];
    } catch {
      return staticEntries;
    }
  },
  schema: z.object({
    name: z.string(),
    author: z.string(),
    description: z.string(),
    image: z.string().optional(),
    imageUrl: z.string().nullable(),
    urls: z.object({
      project: z.string().url().optional(),
      author: z.string().url().optional(),
    }),
  }),
});

export const collections = { projects };
