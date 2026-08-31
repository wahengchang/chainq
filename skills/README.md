# Agent skills

chainq ships its Agent Skills here, in the open [Agent Skills](https://agentskills.io)
layout: one directory per skill, each with a `SKILL.md` plus optional references.

| Skill | What it teaches | Install |
|---|---|---|
| [`chainq`](chainq/) | Author, run, and debug chainq flows as real prompt chains — keeping the model's work in visible `ai` nodes instead of hidden in scripts. | `npx skills add wahengchang/chainq --skill chainq` |

These files are the source of truth. `npx skills add` reads them straight from the
repository, and the Claude Code plugin manifests in `.claude-plugin/` point at the
same directory — there is no second copy to keep in sync.
