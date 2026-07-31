import { getCollection } from "astro:content";
import type { ImageMetadata } from "astro";

const images = import.meta.glob<{ default: ImageMetadata }>(
  "@assets/images/*.{png,jpg,jpeg,gif,svg,webp}",
);

async function localImage(name?: string) {
  if (!name) return undefined;
  for (const [path, load] of Object.entries(images)) {
    if (path.endsWith(name)) return (await load()).default;
  }
}

export async function loadProjects() {
  const entries = await getCollection("projects");
  // By name, not the id getCollection defaults to: ids are slugs, so
  // "spread-the-love" would sort below "sign" while the titles do not.
  entries.sort((a, b) => a.data.name.localeCompare(b.data.name));

  return Promise.all(
    entries.map(async (project) => ({
      project,
      img: await localImage(project.data.image),
    })),
  );
}

export type LoadedProject = Awaited<ReturnType<typeof loadProjects>>[number];
