# 建立 `assemble` 節點(純資料組裝,不呼叫模型)

`assemble` 用 `prompt` 範本把上游資料重新排版/組合,但**不呼叫模型** — 純字串樣板代入。
對應 n8n 的「Merge / Set」這類整理動作:把多條上游貼標籤併成一份、或抽欄位重組。
每筆輸入跑一次(per-item)。

| 欄位 | 必填 | 說明 |
|---|---|---|
| `prompt` | ✅ | 範本(同 ai 的語法,但結果不送模型,直接當輸出) |
| `from` | ⬜ | 上游;常用多上游 `[a, b]` 把兩條流併起來 |

starter 預設:`{ type: assemble, prompt: "{{ $json }}" }`

## CLI

把兩條上游貼標籤併成一份文件(取自 `examples/fan-in-merge.yaml`):

```yaml
  merge:
    type: assemble
    from: [node1, node2]
    prompt: |
      【美食】
      {{ $node["node1"] }}

      【景點】
      {{ $node["node2"] }}
```

下游只要 `from: merge` 一條,不必知道上面分了幾岔。

## URL

```bash
# 1) 建節點
curl -s http://127.0.0.1:<PORT>/api/add-node \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","id":"merge","type":"assemble"}'

# 2) 接兩條上游(順序有意義:第一個是 $json)
curl -s http://127.0.0.1:<PORT>/api/connect \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"merge","from":["node1","node2"]}'

# 3) 設組裝範本
curl -s http://127.0.0.1:<PORT>/api/set \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"merge","field":"prompt","value":"【美食】\n{{ $node[\"node1\"] }}\n\n【景點】\n{{ $node[\"node2\"] }}"}'
```

## assemble vs merge,差在哪?

- `assemble`:**你用範本自己決定**怎麼拼字串(per-item),可吃任意多上游。
- `merge`:**結構化**合併兩條 items 流(append / byPosition / byKey),恰 2 上游,見
  [create-merge.md](create-merge.md)。

需要「貼標籤併文字」用 `assemble`;需要「兩個資料陣列照規則接起來」用 `merge`。

## 常見錯誤(validate 會擋)

- `prompt references $node["X"] but X is not upstream` — 範本引用的節點不是上游。引用可**跨層**取任一祖先的值(不必直接寫進 `from`),但被引用的節點必須在上游某處。
- `prompt uses {{ $json }} but the step has no from:` — 用了 `{{ $json }}` 卻沒接上游。

## 相關

- 總覽:[create.md](create.md) · 索引:[README.md](README.md)
- 對照 ai 版合流:`examples/fan-in.yaml`(node3 用 ai 邊讀邊合成)
