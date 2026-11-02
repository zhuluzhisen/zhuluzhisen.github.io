// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://zhuluzhisen.github.io',
  base: '/',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  integrations: [
    mdx(),
    sitemap({
      // 404 与秘密档案不进站点地图：档案页只留暗门
      filter: (page) => !page.includes('/404') && !page.includes('/secret'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
