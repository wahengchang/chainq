# Visual editor guide

The visual editor changes and runs the same YAML file as the CLI. It binds only
to `127.0.0.1` on a random port.

## Open a flow

```bash
chainq ui flow.yaml
```

With no path, the start page lists flows under the current directory and can
create a project or another flow. Passing a path opens that flow directly.

## Understand the canvas

Each card is a node under `steps`. Solid warm wires show `from` data flow; dashed
cool wires show ancestor references such as `{{ $('source') }}`. Use the toolbar
to hide reference wires, zoom, pan, or fit the graph.

Select a node to edit its type-specific fields and inspect its input and output.
Unsaved changes are drafts: **Save** writes the YAML, while **Reset** restores the
file. Canvas positions are stored separately in `.chain/layout.json`.

## Build and connect nodes

1. Add a node and choose `input`, `ai`, `cmd`, `assemble`, or `write`.
2. Give it a unique identifier and complete the fields shown in its panel.
3. Drag from an upstream output handle to the downstream input handle. The editor
   updates `from` and prevents cycles.
4. Select a wire when you want to insert a node between its endpoints.
5. Save, then use the raw YAML view if you need to review the complete file.

The visual editor and CLI use the same validation rules. See the
[flow YAML reference](../reference/flow.md) for fields that are easier to inspect
as YAML.

## Run and inspect

Select **Run** to execute the draft shown on the canvas. Each node displays live
state and its real output. Input nodes present controls for declared `params`.
The timeout control sets a node's timeout in seconds; an empty value falls back
to `defaults.timeout`, then 300 seconds.

Editing a draft and running it does not silently save it. Save when the result is
ready, or reset to discard the draft. Stop cancels active subprocesses.

## Safety

The editor starts local commands and model CLIs with your user permissions. Open
only flows you trust, and do not proxy the local server onto an untrusted
network.
