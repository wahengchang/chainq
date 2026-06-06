# 場景:建立各種東西(CLI ╳ URL 對照)

這份文件把 chain 裡「可以建立的東西」逐項列出,每一項同時給 **CLI 指令** 和
**URL(web API)語法** 兩種做法。兩條路走的是同一個引擎,改的是同一份
`flow.yaml`、同一個 `.chain/` cache,所以你可以隨意混用。

> **先看這個:** 剛接觸的話先讀 [../getting-started.md](../../getting-started.md)。
> CLI 完整參考在 [../cli/](../../cli/);本檔聚焦「建立」這一類動作。

---

## 先備知識:URL 語法是什麼

`chainq ui` 會在本機開一個 web server,只綁 `127.0.0.1`,**port 是隨機的**。
啟動時會印出網址:

```bash
chainq ui
# chainq ui → http://127.0.0.1:54321/      ← 這個 port 每次不同
```

下面所有 URL 範例裡的 `<PORT>` 換成你看到的那個數字;`<FLOW>` 換成 flow.yaml
的**絕對路徑**(API 一律用絕對路徑)。建立類動作都是 `POST`,body 是 JSON。
你可以用 `curl` 直接打,也可以在瀏覽器介面點按鈕(按鈕背後打的就是這些端點)。

> ⚠️ server 會在你機器上**讀寫檔案**,所以它只聽 localhost。不要把這個 port 對外開放。

---

## 可以建立的東西

| # | 要建立的東西 | CLI | URL(web API) |
|---|---|---|---|
| 1 | 專案(資料夾 + 起始檔) | `chainq init <dir>` | `POST /api/create`(只建資料夾 + 一個 flow) |
| 2 | 工作流(一份 flow YAML) | `chainq new <name>` | `POST /api/create` |
| 3 | 節點(7 種型別) | 手寫 YAML `steps:` | `POST /api/add-node` |
| 4 | 節點連線(接線 `from`) | 手寫 YAML `from:` | `POST /api/connect` |
| 5 | 輸入欄位(`input` 節點) | 手寫 YAML `params:` | `POST /api/add-node` + `/api/set` |

逐項教學如下。

---

## 1. 建立一個專案

一個「專案」= 一個資料夾,裡面放一份以上的 flow YAML,共用一個 `.chain/` cache。

### CLI

```bash
chainq init my-flow
```

`chainq init` 會 scaffold 一個**可直接跑**的起始專案:

```
my-flow/
├─ flow.yaml      ← 起始 chain(load → summarize 範本)
├─ input.txt      ← 一個範例輸入
└─ .gitignore     ← 忽略 .chain/ cache
```

拒絕覆蓋已存在的 `flow.yaml`,除非加 `--force`。

### URL

web 沒有「一鍵 scaffold 整個專案」的端點。它的 `/api/create` 會**建資料夾**
(遞迴 mkdir)並寫入**一份** flow YAML,但**不會**幫你產 `.gitignore` 和
`input.txt`,範本也不同(draft → refine,不是 load → summarize)。

```bash
curl -s http://127.0.0.1:<PORT>/api/create \
  -H 'content-type: application/json' \
  -d '{"dir":"/absolute/path/to/my-flow","name":"flow"}'
# → {"path":"/absolute/path/to/my-flow/flow.yaml"}
```

`name` 不含副檔名時會自動補 `.yaml`。檔案已存在會回 `409`。

> **差異提醒:** 要完整 scaffold(含 `.gitignore` + `input.txt`)請用 CLI 的
> `chainq init`。web 的 create 等於「在某資料夾裡開一份新 flow」,見下一項。

---

## 2. 建立一個工作流(再加一份 flow)

一個專案可以放很多 flow。在既有專案裡再開一份:

### CLI

```bash
chainq new tweets          # 產生 tweets.yaml(draft → refine 的 2 節點起始 chain)
chainq run tweets.yaml
chainq ls                  # 列出專案裡每一份 flow
```

`new` 只寫一份 flow 檔,不碰專案其他檔案。已存在會拒絕覆蓋,除非 `--force`。

### URL

跟「在資料夾裡建一份 flow」是同一個端點,範本也相同(draft → refine):

```bash
curl -s http://127.0.0.1:<PORT>/api/create \
  -H 'content-type: application/json' \
  -d '{"dir":"/absolute/path/to/my-flow","name":"tweets"}'
# → {"path":"/absolute/path/to/my-flow/tweets.yaml"}
```

列出某資料夾裡的 flow(對應 `chainq ls`):

```bash
curl -s "http://127.0.0.1:<PORT>/api/list?dir=/absolute/path/to/my-flow"
# → {"dir":"...","flows":["flow.yaml","tweets.yaml"]}
```

---

## 3. 建立一個節點

一份 flow 是一串節點(steps)。型別有 7 種,各自的最小起始欄位如下表
(這張表是引擎的 `nodeStarter` 單一真相):

| 型別 | 用途 | 起始欄位 | 專屬教學 |
|---|---|---|---|
| `ai` | 呼叫模型 | `prompt: "new step"` | [create-ai.md](create-ai.md) |
| `cmd` | 跑 shell 指令 | `run: "echo hello"` | [create-cmd.md](create-cmd.md) |
| `assemble` | 純整理/搬資料(不呼叫模型) | `prompt: "{{ $json }}"` | [create-assemble.md](create-assemble.md) |
| `splitOut` | 把一筆拆成多筆(fan-out) | (無,需接 1 上游) | [create-splitout.md](create-splitout.md) |
| `aggregate` | 把多筆併成一筆(fan-in) | (無,需接 1 上游) | [create-aggregate.md](create-aggregate.md) |
| `merge` | 合併兩個上游 | `mode: "append"` | [create-merge.md](create-merge.md) |
| `input` | 宣告執行期輸入欄位 | `params: {}` | [create-input.md](create-input.md) |
| `write` | 把結果寫到檔案 | `path: "out/{{date}}.md"` | [create-write.md](create-write.md) |

> 想在**瀏覽器介面**裡點按建立(而非 curl)?見 [web-ui.md](web-ui.md)。

### CLI

CLI 沒有「加節點」的專用指令 — 直接在 `flow.yaml` 的 `steps:` 底下手寫。
例如新增一個 `ai` 節點:

```yaml
steps:
  draft:
    type: ai
    prompt: 'Write one sentence about chains.'

  summarize:           # ← 新增這個節點
    type: ai
    from: draft
    prompt: 'Summarize in one sentence: {{ $json }}'
```

寫完用 `chainq validate flow.yaml` 檢查,再 `chainq run flow.yaml`。

### URL

```bash
curl -s http://127.0.0.1:<PORT>/api/add-node \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","id":"summarize","type":"ai"}'
# → {"ok":true,"id":"summarize"}
```

- `type` 省略時預設 `ai`。
- 節點 id 不合法會回 `400`(含原因);id 已存在也回 `400`。
- 新節點是**未接線**的(刻意如此):像 `merge`/`splitOut` 加進來會處於
  「需要輸入」狀態,直到你用下一項把它接上。

---

## 4. 建立節點之間的連線(接線)

`from` 決定一個節點吃哪些上游的輸出。第一個上游是 `{{ $json }}`;其餘用
`{{ $node["id"] }}` 或 n8n 寫法 `{{ $('id') }}` 取用。

### CLI

在 YAML 裡寫 `from`:

```yaml
  refine:
    type: ai
    from: draft               # 單一上游
    prompt: 'Make it punchier: {{ $json }}'

  merged:
    type: merge
    from: [draft, refine]     # 多上游;順序有意義(第一個 = $json)
    mode: append
```

### URL

拖拉接線用的端點(順序會原樣保留,id 含特殊字元也安全):

```bash
curl -s http://127.0.0.1:<PORT>/api/connect \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"refine","from":["draft"]}'
# → {"ok":true}
```

- 多上游就放多個:`"from":["draft","refine"]`(第一個是 `$json` primary)。
- 清空接線:`"from":[]`。
- 舊式逗號字串端點 `POST /api/set-from`(body `{"path","node","from":"a,b"}`)
  仍可用,但含特殊字元的 id 請用 `/api/connect`。
- 接線若會**新製造**錯誤(指到不存在的節點、產生環、或弄壞 YAML)會被擋下、
  回 `400`,不落地(壞不落地)。

---

## 5. 建立輸入欄位(`input` 節點)

`input` 節點宣告「執行這條 chain 時要填的欄位」(像 CLI 的 `--input`)。
建立分兩步:先加 `input` 節點,再寫它的 `params`。

### CLI

```yaml
steps:
  topic:
    type: input
    params:
      subject: { type: string, required: true }
      tone:    { type: string }
```

執行時帶入值:

```bash
chainq run flow.yaml --input subject=AI --input tone=funny
# 或一次給多組:
chainq run flow.yaml --input-file inputs.jsonl
```

### URL

先建節點:

```bash
curl -s http://127.0.0.1:<PORT>/api/add-node \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","id":"topic","type":"input"}'
```

再設定欄位(逐欄寫 `params`,或直接 `POST /api/save` 存整份 YAML):

```bash
curl -s http://127.0.0.1:<PORT>/api/set \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"topic","field":"params","value":{"subject":{"type":"string","required":true}}}'
```

web 執行時透過 `POST /api/run` 的 body 帶 `input`(欄位值的陣列),走的是和
CLI `--input` **同一個輸入契約**,所以兩邊用同樣的規則驗證、回同樣的錯誤訊息。

---

## 建立完之後

- **驗證:** `chainq validate <flow.yaml>` /(web 在存檔與執行前自動驗,壞的不落地)。
- **執行:** `chainq run <flow.yaml>` /(web `POST /api/run`,結果逐節點串流)。
- **只跑到某節點:** `chainq run --to <node>` /(web `POST /api/run-node`)。
- 改一個節點 → 只有它和下游重跑,其餘吃 cache。這是整個工具的核心,細節見
  [../cli/explanation.md](../../cli/explanation.md)。

## 相關文件

- 入門走一遍:[../getting-started.md](../../getting-started.md)
- CLI 完整參考:[../cli/reference.md](../../cli/reference.md)
- 各端點對應的程式碼:`src/web/server.ts`(URL API)、`src/cli/index.ts`(CLI)
