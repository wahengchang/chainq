# Troubleshooting

## The command is not found

Confirm Node.js 18 or newer is active and reinstall the package, or prefix the
command with `npx @wahengchang2023/chainq`.

## An `ai` node reports an authentication error

Run the login command for the CLI named by the selected profile (for the starter
profile, `claude login`). Then run the flow again. chainq does not manage model
credentials.

## Validation rejects a reference

Every identifier in `from` must exist, and the graph cannot contain a cycle. A
`$('node')` or `$node["node"]` expression must name an ancestor of the current
node. Add the required dependency path or correct the identifier.

## Structured output fails

An `ai` node with `schema` must return a JSON **object**, not plain text or a
bare array. Every declared field must have the declared shallow type. Tell the
model to return only the object. chainq retries invalid structured output once.

## A command does not understand pipes or redirection

`cmd.run` is executed without a shell. Pipes, redirects, glob expansion, and
other shell syntax are not interpreted. Put complex logic in a reviewed script
and invoke that script from `run`.

## A node runs despite `--cache`

A `cmd` node without `inputs` is intentionally volatile. Declare every file it
reads under `inputs`. A changed prompt, profile, input file, option, or upstream
cache key also invalidates the node.

## A partial run has no upstream output

`--from`, `--to`, and `--steps` may need cached prerequisite output. Run the
complete flow once, or choose a boundary whose prerequisites exist. Use `--pin`
to supply a known sample during an isolated trial.

## Output is missing from a pipe

Results use stdout and progress uses stderr. Do not use `--silent`, which hides
both. `--quiet` is appropriate for pipes because it keeps results while hiding
normal progress.

For the complete contracts, see the [CLI reference](reference/cli.md) and
[flow YAML reference](reference/flow.md).
