# chainq documentation site

This Astro + Starlight site publishes the canonical Markdown already stored in the
same `wahengchang/chainq` repository. Do not edit `src/content/docs/` or
`public/generated/`; both are recreated from `sync-manifest.yml` before every dev
server and production build.

## Local development

From `docs-site/`:

```bash
bun install
bun run test
bun run check
bun run dev
```

The project is configured with `base: /chainq`. Open the URL printed by Astro,
including the `/chainq/` suffix.

## Production build

```bash
bun run build
bun run preview
```

The build pipeline performs these steps:

```text
sync-manifest.yml
  → read allowlisted README.md / docs/**/*.md from the repository root
  → inject the source file's real Git commit time
  → rewrite internal links and copy local images
  → validate generated pages and provenance
  → Astro production build
```

GitHub Actions deploys `dist/` to `https://wahengchang.github.io/chainq/` only
after sync, validation, and build succeed.

## Add or remove a page

Edit `sync-manifest.yml`. Every page must explicitly declare its canonical
`from`, generated `to`, and title. The system intentionally has no catch-all
`docs/**/*.md` publishing rule, so internal design notes cannot become public by
accident.
