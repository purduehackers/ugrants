# ugrants

Micro grants by [Purdue Hackers](https://purduehackers.com) to fund ambitious student projects and artworks.

## Tech Stack

- [Astro](https://astro.build) - Static site generator
- [Svelte](https://svelte.dev) - Interactive components
- [Tailwind CSS](https://tailwindcss.com) - Styling
- [Sharp](https://sharp.pixelplumbing.com) - Image processing with custom dithering

## Development

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
pnpm preview
```

## Deployment

The project uses a Node.js adapter for server-side rendering in production. A Dockerfile is included for containerized deployments.

## Project Structure

```
src/
├── assets/         # Images and project data
├── components/     # Astro and Svelte components
├── layouts/        # Page layouts
├── lib/            # Utilities (custom Sharp image service)
├── pages/          # Route pages
└── styles/         # Global CSS
```
