import { defineConfig } from 'astro/config';

// Static output for free hosting (GitHub Pages / Netlify / Cloudflare Pages).
export default defineConfig({
  site: 'https://indipetae.example.org',
  trailingSlash: 'never',
  build: {
    format: 'directory',
  },
});
