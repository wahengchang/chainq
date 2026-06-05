# chain CLI documentation

Organized by the [Diátaxis](https://diataxis.fr) framework — four kinds of doc,
each answering a different question:

| If you want to… | Read | Kind |
|---|---|---|
| **learn** the tool by building your first chain | [tutorial.md](./tutorial.md) | Tutorial |
| **do a specific task** (loop over a list, run a subset, pin a sample) | [how-to.md](./how-to.md) | How-to |
| **look up** a command, flag, node type, or `{{ }}` selector | [reference.md](./reference.md) | Reference |
| **understand why** chain works the way it does (items model, cache) | [explanation.md](./explanation.md) | Explanation |

New here? Start with the [tutorial](./tutorial.md). Already know the basics and
just need a fact? Jump to the [reference](./reference.md).

> chain runs prompt chains on your **local CLI model** (`claude -p`) — one YAML
> file per flow. Every `ai` step calls the real model, so run `claude login` once.
