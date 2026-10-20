import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

export const GET: APIRoute = async () => {
  const projects = await getCollection("projects");
  const urls = [
    "https://grants.purduehackers.com/",
    ...projects.map(
      (project) =>
        `https://grants.purduehackers.com/projects/${encodeURIComponent(project.id)}`,
    ),
  ];
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${url}</loc></url>`).join("")}</urlset>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
};
