# 建立 `ai` 節點(呼叫模型)

`ai` 節點把它的 `prompt` 送給本機 CLI 模型(`claude -p`)執行,輸出模型回的文字。
這是最常用的節點。每筆輸入跑一次(per-item)。

| 欄位 | 必填 | 說明 |
|---|---|---|
| `prompt` | ✅ | prompt 範本,可含 `{{ $json }}`、`{{ $json.field }}`、`{{ $node["id"] }}`、`{{ $('id') }}` |
| `from` | ⬜ | 上游節點;單一或 `[a, b]`(第一個是 `{{ $json }}`) |
| `profile` | ⬜ | 用哪個 profile,預設 `default` |
| `schema` | ⬜ | 結構化輸出:JSON `欄位→型別` 表(見下) |

starter 預設:`{ type: ai, prompt: "new step" }`

## 結構化輸出(`schema`)

設了 `schema` 之後,模型輸出會被**解析成 JSON 並驗證**;對不上會自動帶更正提示**重試一次**,
再不符就讓節點 fail。成功時這個節點的輸出 item 就是**解析後的物件**(不再是生文字)。
型別可用 `string` / `number` / `boolean` / `array` / `object`(`array`/`object` 只淺檢查容器,
多出來的欄位允許)。來源:`src/engine/run.ts`、`src/engine/schema.ts`。

```yaml
  extract:
    type: ai
    from: source
    prompt: '抽出標題與分數:{{ $json }}'
    schema:
      title: string
      score: number
      tags: array
```

web UI 的 `ai` 面板有對應的 **schema** 欄(填 JSON);見 [web-ui.md](web-ui.md)。

## CLI

在 `flow.yaml` 的 `steps:` 下手寫:

```yaml
profiles:
  default: { cmd: 'claude -p' }

steps:
  draft:
    type: ai
    prompt: 'Write one sentence about chains.'

  refine:                 # ← 新增的 ai 節點
    type: ai
    from: draft
    prompt: 'Make it punchier: {{ $json }}'
```

驗證並執行:

```bash
chainq validate flow.yaml
chainq run flow.yaml
```

## URL

```bash
# 1) 建節點(starter)
curl -s http://127.0.0.1:<PORT>/api/add-node \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","id":"refine","type":"ai"}'

# 2) 設 prompt
curl -s http://127.0.0.1:<PORT>/api/set \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"refine","field":"prompt","value":"Make it punchier: {{ $json }}"}'

# 3) 接上游 draft
curl -s http://127.0.0.1:<PORT>/api/connect \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"refine","from":["draft"]}'
```

換 profile 就再 `POST /api/set` 一次 `field:"profile"`。

## 常見錯誤(validate 會擋)

- `ai step has no prompt` — `prompt` 是必填。
- `profile "X" not found` — `profile` 指到不存在的 profile(會提示最接近的名字)。
- `prompt uses {{ $json }} but the step has no from:` — 用了 `{{ $json }}` 卻沒接上游。
- `prompt references $node["X"] but X is not upstream` — prompt 引用的節點不是上游。引用可**跨層**取任一祖先的值(不必直接寫進 `from`),但被引用的節點必須在上游某處。

## 相關

- 總覽:[create.md](create.md) · 索引:[README.md](README.md)
- 多上游接線:[create-merge.md](create-merge.md)、`examples/fan-in.yaml`
