# 場景:一個 input → 三個 output → 進 loop 跑三次

延續 [flow-one-input-three-outputs.md](flow-one-input-three-outputs.md)。這篇多一步:把那
三個 output **逐筆**送進下游,讓下游節點**自動跑三次**。

```
topic(input, 1 筆)
   └─→ ideas(ai+schema, 產出含 3 個點子的物件)
          └─→ split(splitOut, 拆成 3 筆)
                 └─→ expand(ai, 對每筆各跑一次 ← 這就是「loop」,跑 3 次)
```

## 先講清楚:chain 沒有「loop」關鍵字

chain **沒有迴圈節點**。所謂「跑三次」是 **items model**:一條 wire 上流的是一個
**items 陣列**,而 `ai` / `cmd` / `assemble` 節點會**對每一筆輸入各跑一次**。

所以只要上游有 3 筆,下游就自動執行 3 次 —— 不必寫迴圈。來源:`src/engine/run.ts` 的
`runCount = primary ? itemsOf(primary).length : 1`(節點對 primary 上游的每一筆跑一輪)。

把一筆變多筆的就是 `splitOut`(fan-out);這篇用它製造出「3 筆」,下游就跑 3 次。

## 完整 flow.yaml

```yaml
# 1 input → 3 outputs → 對每個 output 各跑一次(共 3 次)
#   chainq run flow.yaml --input subject=咖啡
profiles:
  default: { cmd: 'claude -p' }

steps:
  # 1) 一個輸入
  topic:
    type: input
    params:
      subject: { type: string, required: true }

  # 2) 產出「3 個」結構化點子。用 schema 保證輸出是含 ideas 陣列的 JSON 物件,
  #    對不上會自動帶更正提示重試一次(見 creation/create-ai.md)。
  ideas:
    type: ai
    from: topic
    prompt: |
      產生 3 個關於「{{ $json.subject }}」的點子。
      只輸出 JSON 物件,格式:
      {"ideas": [{"title": "短標題", "angle": "切入角度"}, … 剛好 3 個]}
    schema:
      ideas: array

  # 3) 把 ideas 陣列拆成 3 筆獨立 item(fan-out)
  split:
    type: splitOut
    from: ideas
    field: ideas

  # 4) LOOP:對 split 的每一筆各跑一次 → 自動執行 3 次
  expand:
    type: ai
    from: split
    prompt: '針對這個點子寫一句文案:{{ $json.title }}({{ $json.angle }})'
```

## 跑起來:看「執行三次」

```bash
chainq validate flow.yaml
chainq run flow.yaml --input subject=咖啡
```

每個節點後面的 **item 數**就是它跑的次數證據:

```
plan: 2 ai call(s) · 0 reused · 0 skipped
✓ topic   (1 item)
✓ ideas   (1 item)      ← 一個物件 {ideas:[3 個]}
✓ split   (3 items)     ← 拆成 3 筆
✓ expand  (3 items)     ← LOOP:跑了 3 次,每筆一個結果
```

`expand` 顯示 `(3 items)` 就代表它對 3 筆輸入各跑了一次。看每筆結果:

```bash
cat .chain/outputs/expand.out      # 3 筆 item
```

> 註:`plan` 的「ai call(s)」是**節點數**層級的預估(此處 ideas + expand 兩個 ai 節點);
> 實際模型呼叫會隨 `expand` 的 3 筆而發生 3 次。item 數才是逐筆執行的真實證據。

## 想把三筆收回成一份?

loop 完通常要彙整。接 `aggregate`(收成一筆陣列)或 `write`(落檔):

```yaml
  collect:
    type: aggregate          # 3 筆 → 1 筆(值是含 3 個結果的陣列)
    from: expand

  save:
    type: write              # 把結果寫成檔案
    from: expand
    path: 'out/{{date}}.md'
```

- 收成資料再交下游 → [creation/create-aggregate.md](creation/create-aggregate.md)
- 直接落檔 → [creation/create-write.md](creation/create-write.md)

## URL / 瀏覽器

- 用 curl 從零建這條 flow 的端點順序,同上一篇的「URL 跑法」,把節點換成本篇四個即可
  (`add-node` 各型別 → `set` 設 prompt/schema/field → `connect` 串起來 → `run`)。
- 想用瀏覽器點按建立:[creation/web-ui.md](creation/web-ui.md)
  (注意 `input` 不在「+ add step」下拉,要用「{ } raw」加)。

## 常見坑

- 沒拿到 3 筆 → 多半是 `ideas` 沒吐出合法 JSON 物件。加了 `schema: { ideas: array }` 會自動
  驗證 + 重試一次;仍失敗就看 prompt 是否強調「只輸出 JSON、不要 ``` 圍欄」。
- `split` 報 `splitOut needs exactly 1 input` → 只能接 1 個上游。
- `expand` 只跑 1 次 → 它的上游不是 3 筆(確認 `from: split`,不是 `from: ideas`)。

## 相關

- 前一篇(只到 3 個 output):[flow-one-input-three-outputs.md](flow-one-input-three-outputs.md)
- 場景總索引:[README.md](README.md)
