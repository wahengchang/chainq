# Documentation maintenance

The Markdown files in the repository root and `docs/` are canonical. The
Starlight site generates pages from an explicit allowlist in
`docs-site/sync-manifest.yml`; never edit generated files under
`docs-site/src/content/docs/` or `docs-site/public/generated/`.

## Information architecture

| Location | Purpose |
|---|---|
| `README.md` | Product overview and shortest successful path |
| `docs/getting-started.md` | Installation and first run |
| `docs/guides/` | Goal-oriented tutorials and procedures |
| `docs/reference/` | Complete CLI and YAML contracts |
| `docs/concepts/` | Explanations of behavior and design |
| `docs/troubleshooting.md` | Symptoms, causes, and fixes |
| `docs/internal/` | Historical records that do not define current behavior |

Put a fact in one canonical page and link to it elsewhere. Do not duplicate the
command option table or flow schema in guides.

## Writing standard

- Use **chainq** for the product, **flow** for a YAML-defined graph, **node** for
  one entry under `steps`, and **visual editor** for `chainq ui`.
- Use sentence-case headings and direct, present-tense instructions.
- Put commands, paths, options, node types, fields, and expressions in code style.
- State defaults and units. Distinguish stdout from stderr where relevant.
- Keep examples runnable and use repository-relative links.
- Describe current behavior in user docs. Put proposals and superseded decisions
  in `docs/internal/` with a historical notice.

## Change checklist

1. Update the relevant reference page when code changes a command or YAML field.
2. Update a guide only when the user workflow changes.
3. Add or remove public pages in `docs-site/sync-manifest.yml` and the Starlight
   sidebar together.
4. Run the repository tests and the documentation-site checks.
5. Check local Markdown links before committing.

