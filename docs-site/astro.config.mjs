import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { DOCS_SITE } from "./scripts/config.mjs";

export default defineConfig({
  site: DOCS_SITE.origin,
  base: DOCS_SITE.base,
  integrations: [
    starlight({
      title: "chainq documentation",
      description: "Build and run local prompt chains from one YAML file.",
      lastUpdated: true,
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/wahengchang/chainq",
        },
      ],
      sidebar: [
        { label: "Home", slug: "index" },
        { label: "Documentation", slug: "documentation" },
        { label: "Getting started", slug: "getting-started" },
        {
          label: "Guides",
          items: [{ autogenerate: { directory: "guides" } }],
        },
        {
          label: "Reference",
          items: [{ autogenerate: { directory: "reference" } }],
        },
        {
          label: "Concepts",
          items: [{ autogenerate: { directory: "concepts" } }],
        },
        { label: "Troubleshooting", slug: "troubleshooting" },
        { label: "Changelog", slug: "changelog" },
      ],
    }),
  ],
});
