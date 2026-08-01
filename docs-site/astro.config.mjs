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
        { label: "Getting started", slug: "getting-started" },
        {
          label: "CLI",
          items: [{ autogenerate: { directory: "cli" } }],
        },
        { label: "FAQ", slug: "faq" },
        {
          label: "Scenarios",
          items: [{ autogenerate: { directory: "scenario" } }],
        },
        { label: "Changelog", slug: "changelog" },
      ],
    }),
  ],
});
