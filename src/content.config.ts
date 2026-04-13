import { defineCollection, z } from "astro:content";

const projects = defineCollection({
  loader: async () => {
    const cmsUrl = import.meta.env.CMS_URL ?? process.env.CMS_URL;
    if (!cmsUrl) throw new Error("CMS_URL environment variable is required");

    const res = await fetch(
      `${cmsUrl}/api/ugrants?where[visible][equals]=true&depth=1&limit=100`,
    );
    if (!res.ok) throw new Error(`CMS fetch failed: ${res.status}`);

    const { docs } = await res.json();

    return docs.map((doc: any) => ({
      id: String(doc.id),
      name: doc.name,
      author: doc.author,
      description: doc.description,
      imageUrl: doc.image?.url ?? null,
      urls: {
        author: doc.authorUrl ?? undefined,
        project: doc.projectUrl ?? undefined,
      },
    }));
  },
  schema: z.object({
    name: z.string(),
    author: z.string(),
    description: z.string(),
    imageUrl: z.string().nullable(),
    urls: z.object({
      project: z.string().url().optional(),
      author: z.string().url().optional(),
    }),
  }),
});

export const collections = { projects };
