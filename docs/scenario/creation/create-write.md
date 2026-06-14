# 建立 `write` 節點(把結果寫到檔案)

`write` 是「成品」節點:把它主上游的 items(轉成文字)寫進一個檔案。常放在 chain 最末端,
把最後結果落地成 `.md` / `.txt` / `.json` 等。

| 欄位 | 必填 | 說明 |
|---|---|---|
| `path` | ✅ | 輸出檔路徑(相對 cwd)。支援 `{{date}}` / `{{datetime}}` 變數 |
| `from` | ✅ | 至少 1 個上游(要寫誰的輸出) |
| `mode` | ⬜ | `overwrite`(預設,覆寫)或 `append`(附加) |

starter 預設:`{ type: write, path: "out/{{date}}.md", mode: "overwrite" }`

行為(`src/engine/run.ts`):取主上游的 items 轉文字寫入 `path`;目錄不存在會自動建。

## CLI

```yaml
  save:
    type: write
    from: result
    path: 'out/{{date}}.md'    # 例:out/2026-06-05.md
    mode: overwrite
```

附加模式(每次跑都接到同一檔尾):

```yaml
  log:
    type: write
    from: result
    path: 'out/log.md'
    mode: append
```

## URL

```bash
# 1) 建節點(starter 已含 path + mode)
curl -s http://127.0.0.1:<PORT>/api/add-node \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","id":"save","type":"write"}'

# 2) 接上游
curl -s http://127.0.0.1:<PORT>/api/connect \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"save","from":["result"]}'

# 3) 設 path / mode
curl -s http://127.0.0.1:<PORT>/api/set \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"save","field":"path","value":"out/{{date}}.md"}'
```

web UI 裡 `write` 節點面板有 **path** 與 **mode** 兩個欄位,見 [web-ui.md](web-ui.md)。

## 產生 JSON 檔

`write` 寫的是主上游 items 的文字。若上游是**結構化物件**(例如 `ai` 節點設了 `schema`,
輸出被解析成真正的 JSON 物件),write 會把它序列化成 JSON 再寫出 —— 把 `path` 設成 `.json`
就得到一個合法 JSON 檔。**直接在 prompt 裡手拼 `{ }` 字串容易因引號/換行壞掉,改用 `ai + schema`
讓引擎驗證才穩**(schema 見 [create-ai.md](create-ai.md))。

```yaml
  to_json:
    type: ai
    from: [field_a, field_b]
    schema: { title: string, body: string }   # ← 輸出被解析+驗證成 JSON 物件
    prompt: 'Build a JSON object with title={{ $('field_a') }} and body={{ $('field_b') }}. Return ONLY JSON.'
  result:
    type: write
    from: to_json
    path: 'out/result.json'                    # ← .json 落地
```

完整可跑範例:[`examples/generate-json.yaml`](../../../examples/generate-json.yaml)
(input → 三個欄位 → `ai+schema` 組成物件 → `write` 寫成 `out/result.json`)。

## 常見錯誤(validate 會擋)

- `write step has no path` — `path` 必填。
- `write needs an input to write (set from:)` — 至少要接 1 個上游。

## 相關

- 總覽:[create.md](create.md) · 索引:[../README.md](../README.md) · 瀏覽器操作:[web-ui.md](web-ui.md)
