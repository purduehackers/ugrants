import { defineCollection, z } from "astro:content";
import staticProjects from "./assets/projects.json";

const author = z.object({
  name: z.string(),
  url: z.string().url().optional(),
});

type Author = z.infer<typeof author>;

// Not split on "&": nothing says which name a lone authorUrl belongs to.
function toAuthors(doc: any): Author[] {
  if (Array.isArray(doc.authors)) {
    return doc.authors
      .map((a: any) => ({ name: a?.name, url: a?.url ?? undefined }))
      .filter((a: Author) => a.name);
  }
  return doc.author ? [{ name: doc.author, url: doc.authorUrl ?? undefined }] : [];
}

const projects = defineCollection({
  loader: async () => {
    const staticEntries = staticProjects.map((p) => ({
      ...p,
      authors: toAuthors(p),
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
        authors: toAuthors(doc),
        description: doc.description,
        image: undefined as string | undefined,
        imageUrl: (doc.image?.url as string) ?? null,
        urls: { project: doc.projectUrl ?? undefined },
      }));

      return [...cmsEntries, ...staticEntries];
    } catch {
      return staticEntries;
    }
  },
  schema: z.object({
    name: z.string(),
    authors: z.array(author),
    description: z.string(),
    image: z.string().optional(),
    imageUrl: z.string().nullable(),
    urls: z.object({
      project: z.string().url().optional(),
    }),
  }),
});

export const collections = { projects };
