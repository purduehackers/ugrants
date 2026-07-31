import { getCollection } from "astro:content";
import type { ImageMetadata } from "astro";
import staticProjects from "@assets/projects.json";

const images = import.meta.glob<{ default: ImageMetadata }>(
  "@assets/images/*.{png,jpg,jpeg,gif,svg,webp}",
);

// getCollection sorts by id, so without this the list is alphabetical.
const order = new Map(staticProjects.map((p, i) => [p.id, i]));

async function localImage(name?: string) {
  if (!name) return undefined;
  for (const [path, load] of Object.entries(images)) {
    if (path.endsWith(name)) return (await load()).default;
  }
}

export async function loadProjects() {
  const entries = await getCollection("projects");
  entries.sort((a, b) => (order.get(a.id) ?? -1) - (order.get(b.id) ?? -1));

  return Promise.all(
    entries.map(async (project) => ({
      project,
      img: await localImage(project.data.image),
    })),
  );
}

export type LoadedProject = Awaited<ReturnType<typeof loadProjects>>[number];
