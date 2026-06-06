# 場景:讀一個 input,產生三個結構化 output

目標:一條最小但完整的 flow —— 讀進一個輸入,叫模型產出 **3 筆結構化結果**,
再把它們拆成 3 筆獨立 item,下游就能逐筆處理。

```
input(subject) ─→ ideas(ai, 吐 JSON 陣列) ─→ split(splitOut, 拆成 3 筆)
```

## 先講最重要的一件事:結構化 output 怎麼來

**`ai` 節點的輸出是生文字,引擎不會自動 parse。** 想要「結構化」,做法是:

1. 在 prompt **明確要求模型只輸出 JSON**(陣列或物件)。
2. 下游節點(如 `splitOut`)用 `coerceJson` 嘗試 `JSON.parse`;成功就變成結構化資料,
   失敗則維持原字串(`splitOut` 會回清楚的「不是陣列」錯誤)。

來源:`src/engine/run.ts` 的 `coerceJson()` 與 `splitOut` 分支。

> 💡 **更穩的做法:`ai` 的 `schema` 欄位。** `ai` 節點可加 `schema`(JSON `欄位→型別`),
> 引擎會自動解析+驗證輸出,對不上會帶更正提示重試一次,成功時輸出直接是結構化物件
> (不必再靠下游 `coerceJson` 猜)。本篇示範的是不依賴 schema 的通用做法;若要逐欄保證
> 結構,把 `ideas` 改成帶 `schema` 的 `ai` 節點更可靠。見
> [creation/create-ai.md](creation/create-ai.md)。

## 完整 flow.yaml

```yaml
# 讀一個輸入 → 產 3 筆結構化結果 → 拆成 3 筆
#   chainq run flow.yaml --input subject=咖啡
profiles:
  default: { cmd: 'claude -p' }

steps:
  # 1) 讀輸入:一個必填欄位 subject
  topic:
    type: input
    params:
      subject: { type: string, required: true }

  # 2) 叫模型產出「恰好 3 筆」結構化結果。重點:要求只輸出 JSON 陣列。
  ideas:
    type: ai
    from: topic
    prompt: |
      只輸出一個 JSON 陣列,剛好 3 個物件,不要任何其他文字或 ```。
      每個物件格式:{"title": "短標題", "detail": "一句說明"}
      主題:{{ $json.subject }}

  # 3) 把那個 JSON 陣列拆成 3 筆獨立 item(fan-out)
  split:
    type: splitOut
    from: ideas
```

跑完 `split` 會有 **3 筆 item**,每筆是 `{ "title": ..., "detail": ... }`。
下游若再接一個 `ai`(`from: split`),就會對這 3 筆**各跑一次**。

## CLI 跑法

```bash
chainq validate flow.yaml
chainq run flow.yaml --input subject=咖啡
```

預期輸出(item 數會顯示在每個節點後):

```
plan: 1 ai call(s) · 0 reused · 0 skipped
✓ topic   (1 item)
✓ ideas   (1 item)      ← 模型回的一整個 JSON 陣列(此時仍是 1 筆文字)
✓ split   (3 items)     ← 拆成 3 筆結構化 item
```

看每筆結果(cache 落在 `.chain/outputs/`):

```bash
cat .chain/outputs/split.out      # 3 筆 item 的 JSON
```

## URL 跑法(用 API 從零建這條 flow)

`chainq ui` 啟動後記下印出的 `<PORT>`,`<FLOW>` 用 flow.yaml 絕對路徑。

```bash
# a) 建檔
curl -s http://127.0.0.1:<PORT>/api/create \
  -H 'content-type: application/json' \
  -d '{"dir":"/abs/path/proj","name":"flow"}'

# b) 三個節點
curl -s http://127.0.0.1:<PORT>/api/add-node -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","id":"topic","type":"input"}'
curl -s http://127.0.0.1:<PORT>/api/add-node -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","id":"ideas","type":"ai"}'
curl -s http://127.0.0.1:<PORT>/api/add-node -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","id":"split","type":"splitOut"}'

# c) 設定欄位
curl -s http://127.0.0.1:<PORT>/api/set -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"topic","field":"params","value":{"subject":{"type":"string","required":true}}}'
curl -s http://127.0.0.1:<PORT>/api/set -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"ideas","field":"prompt","value":"只輸出一個 JSON 陣列,剛好 3 個物件,每個 {\"title\":\"...\",\"detail\":\"...\"}。主題:{{ $json.subject }}"}'

# d) 接線:topic → ideas → split
curl -s http://127.0.0.1:<PORT>/api/connect -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"ideas","from":["topic"]}'
curl -s http://127.0.0.1:<PORT>/api/connect -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"split","from":["ideas"]}'

# e) 執行(帶 input;結果逐節點 NDJSON 串流)
curl -s -N http://127.0.0.1:<PORT>/api/run -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","input":[{"subject":"咖啡"}]}'
```

看每個節點的逐筆資料(對應 web 介面的 per-item 面板):

```bash
curl -s "http://127.0.0.1:<PORT>/api/items?path=<FLOW>&node=split"
```

## 變體:要「三個分開的 output 節點」而不是 3 筆 item

如果你要的是三條各自獨立、語意不同的輸出(例如標題 / 摘要 / 標籤),就用三個平行
`ai` 節點各吃同一個輸入:

```yaml
steps:
  topic: { type: input, params: { subject: { type: string, required: true } } }

  title:   { type: ai, from: topic, prompt: '只輸出標題:{{ $json.subject }}' }
  summary: { type: ai, from: topic, prompt: '只輸出一句摘要:{{ $json.subject }}' }
  tags:    { type: ai, from: topic, prompt: '只輸出 3 個標籤的 JSON 陣列:{{ $json.subject }}' }
```

兩種差別:

- **splitOut 版**:3 筆**同構**結果(同樣結構,適合逐筆套同一下游)。
- **三節點版**:3 個**異構**輸出(各自不同用途),下游可分別取用。

## 常見坑

- 模型多吐了 ```json 圍欄或解說字 → `JSON.parse` 失敗 → splitOut 報「不是陣列」。
  prompt 要強調「只輸出 JSON、不要圍欄、不要其他字」。
- `split` 報 `splitOut needs exactly 1 input` → 只能接 1 個上游。
- `required` 的 `subject` 沒給值 → CLI/web 都會在跑之前擋下(同一套輸入契約)。

## 相關

- 各型別建立法:[create-input.md](creation/create-input.md)、[create-ai.md](creation/create-ai.md)、[create-splitout.md](creation/create-splitout.md)
- 收回來:[create-aggregate.md](creation/create-aggregate.md) · 總覽:[create.md](creation/create.md) · 索引:[README.md](README.md)
