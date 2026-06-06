# 建立 `write` 節點(把結果寫到檔案)

`write` 是「成品」節點:把它主上游的 items(轉成文字)寫進一個檔案。常放在 chain 最末端,
把最後結果落地成 `.md` / `.txt` 等。

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

## 常見錯誤(validate 會擋)

- `write step has no path` — `path` 必填。
- `write needs an input to write (set from:)` — 至少要接 1 個上游。

## 相關

- 總覽:[create.md](create.md) · 索引:[../README.md](../README.md) · 瀏覽器操作:[web-ui.md](web-ui.md)
