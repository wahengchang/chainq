# CLI reference

All commands operate locally. Paths are resolved from the current directory
except input and output paths in a flow, which are resolved from the flow file's
directory.

## Commands

| Command | Description |
|---|---|
| `chainq init [dir] [--force]` | Create `flow.yaml`, `.gitignore`, and `input.txt`. Refuses to replace `flow.yaml` unless `--force` is set. |
| `chainq new <name> [--force]` | Add a starter flow to the current project. Adds `.yaml` when the name has no YAML extension. |
| `chainq ui [flow.yaml]` | Start the visual editor on a random `127.0.0.1` port and optionally open a flow. |
| `chainq ls [dir]` | Recursively list `.yaml` and `.yml` files, excluding hidden directories and `node_modules`. |
| `chainq validate <flow.yaml>` | Check the flow without running commands or models. |
| `chainq run <flow.yaml> [options]` | Validate and run the flow. A full run executes every node unless cache reuse is requested. |

Running an incomplete or unknown command returns exit code `2`. Validation and
run failures return `1`; success returns `0`.

## Run options

| Option | Description |
|---|---|
| `--cache`, `--reuse` | Reuse valid cached outputs during a full run. |
| `--fresh` | Ignore cached outputs. This is already the default for a full run. |
| `--from <node>` | Re-run the named node and its downstream nodes; reuse required upstream output. |
| `--to <node>` | Run only the named node and its upstream dependencies. |
| `--steps <count>` | Run the first `count` nodes in topological order. |
| `--pin <node>=<file>` | Substitute a file for a node's output and isolate the trial under `.chain/scratch/`. Repeat as needed. |
| `--profile <name>` | Use a declared profile for every `ai` node in this run. |
| `--input <name>=<value>` | Set a declared input parameter. Repeat for multiple parameters. Declared types control coercion. |
| `--input-file <file>` | Read one JSON object, an array of objects, or JSONL with one object per line. |
| `-q`, `--quiet` | Hide progress but keep results on stdout and failures on stderr. |
| `-s`, `--silent` | Suppress progress, results, and failure messages; use the exit code. |

`--input` values override matching values from every input set loaded with
`--input-file`.

## Output

Results go to stdout; plans, progress, and errors go to stderr. This keeps pipes
clean:

```bash
chainq run flow.yaml --cache | jq
```

A complete run prints every leaf node. Multiple leaves have an `— <node> —`
heading. A partial run that does not reach a leaf prints the last node it ran.
Before execution, progress output includes the planned AI calls, reused nodes,
and skipped nodes.

See the [flow YAML reference](flow.md) for the file format and [common tasks](../guides/common-tasks.md)
for procedures.
