# 建立 `input` 節點(執行期輸入欄位 / 觸發點)

`input` 是 chain 的觸發點:它**沒有上游**,執行時把宣告的 `params` 加上你帶入的值,
產出 seed item 餵給下游。一組值 → 1 筆 seed;多組值 → 批次(batch)。

| 欄位 | 必填 | 說明 |
|---|---|---|
| `params` | ⬜ | 欄位宣告:`名稱 → { type?, required?, default? }` |
| `from` | ❌ | **禁止**(input 是觸發點,有 from 會報錯) |

starter 預設:`{ type: input, params: {} }`

### ParamSpec(每個欄位的設定,`src/engine/types.ts`)

- `type`:`"string"` · `"number"` · `"boolean"`。設了就照型別強制轉換(`type:"string"`
  會讓 `"42"` 保持字串);不設 → 寬鬆解析(JSON-或字串)。
- `required`:`true` 時該欄位執行必須給值(除非有 `default`),否則 `validateRunInput` 報錯
  —— CLI 與 web **同一套規則、同樣錯誤訊息**。
- `default`:預設值;`required` + `default` 等於永遠滿足(default 會補上)。

## CLI

```yaml
steps:
  topic:
    type: input
    params:
      subject: { type: string, required: true }
      tone:    { type: string, default: 'neutral' }
      count:   { type: number, default: 1 }

  write:
    type: ai
    from: topic
    prompt: 'Write {{ $json.count }} line(s) about {{ $json.subject }}, tone: {{ $json.tone }}'
```

執行時帶值:

```bash
chainq run flow.yaml --input subject=AI --input tone=funny
# 多組(批次)用檔案:每行一個 JSON 物件(JSONL),或一個 JSON 陣列
chainq run flow.yaml --input-file inputs.jsonl
```

## URL

```bash
# 1) 建節點(starter 已含 params: {})
curl -s http://127.0.0.1:<PORT>/api/add-node \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","id":"topic","type":"input"}'

# 2) 設 params(整個 params 物件一次寫)
curl -s http://127.0.0.1:<PORT>/api/set \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"topic","field":"params","value":{"subject":{"type":"string","required":true},"tone":{"type":"string","default":"neutral"}}}'
```

web 執行時透過 `POST /api/run` 的 body 帶 `input`(欄位值的陣列),走的是和 CLI `--input`
**同一個輸入契約**,所以兩邊驗證一致。

## 常見錯誤(validate 會擋)

- `input is a trigger — it must not have a 'from'` — input 不能接上游。
- 靜態 param 錯誤:`type` 非合法字面值,或 `default` 無法轉成宣告的 `type`(如
  `type: number` 配 `default: "oops"`)。
- 執行期:`required` 欄位沒給值又沒 `default` → 報含 `required` 的錯。

## 相關

- CLI 帶值的完整旗標:[../cli/reference.md](../../cli/reference.md)(`--input` / `--input-file`)
- 總覽:[create.md](create.md) · 索引:[README.md](README.md)
