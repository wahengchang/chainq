# 建立 `cmd` 節點(跑 shell 指令)

`cmd` 節點執行一條命令,輸出它的 stdout。常用來讀檔、呼叫工具、做前處理。

> ⚠️ **不是 shell。** `run` 會依**空白切成 argv** 直接 spawn,**沒有** shell:管線
> `|`、萬用字元 `*`、重導 `>`、變數 `$VAR` 都不會生效。需要這些就自己寫成一支腳本再呼叫它。

| 欄位 | 必填 | 說明 |
|---|---|---|
| `run` | ✅ | 命令列(依空白切 argv) |
| `inputs` | ⬜ | 宣告的輸入檔清單;內容雜湊進 cache key → **此節點才可 cache**。不宣告 → 視為易變,每次都重跑 |
| `mode` | ⬜ | `once`(預設,跑一次、不餵 stdin)或 `perItem`(每筆輸入跑一次,把該筆值餵進 stdin) |
| `from` | ⬜ | 上游節點 |

starter 預設:`{ type: cmd, run: "echo hello" }`

## CLI

```yaml
steps:
  load:
    type: cmd
    run: 'cat input.txt'
    inputs: ['input.txt']      # 宣告輸入 → 可 cache(input.txt 沒變就不重跑)
```

`mode: perItem` 範例(把每筆上游資料逐筆丟給指令):

```yaml
  shout:
    type: cmd
    from: load
    run: 'tr a-z A-Z'
    mode: perItem              # 每筆輸入跑一次,值從 stdin 進去
```

## URL

```bash
# 1) 建節點
curl -s http://127.0.0.1:<PORT>/api/add-node \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","id":"load","type":"cmd"}'

# 2) 設 run
curl -s http://127.0.0.1:<PORT>/api/set \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"load","field":"run","value":"cat input.txt"}'

# 3) 宣告 inputs(讓它可 cache)
curl -s http://127.0.0.1:<PORT>/api/set \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"load","field":"inputs","value":["input.txt"]}'

# (選用)設 mode
curl -s http://127.0.0.1:<PORT>/api/set \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"load","field":"mode","value":"perItem"}'
```

> 欄位值是陣列(像 `inputs`)時,`/api/set` 的 `value` 直接放 JSON 陣列即可。
> 多欄位一次設好也可以改用 `POST /api/save` 存整份 YAML。

## 常見錯誤 / 行為

- `cmd step has no run` — `run` 是必填。
- 沒宣告 `inputs:` 的 cmd 視為**易變**:每次 `chainq run` 都重跑,且其下游也跟著重跑。
- 指令非 0 結束碼會讓該節點 `failed`(帶 stderr);逾時則回 `timed out`。

## 相關

- 總覽:[create.md](create.md) · 索引:[README.md](README.md)
- cmd 讀檔接 ai 摘要:見 `chainq init` 的起始 `flow.yaml`(load → summarize)
