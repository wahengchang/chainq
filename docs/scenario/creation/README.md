# scenario/creation — 建立各種元件

每份文件針對「一件具體要建立的東西」,同時給 **CLI 指令** 和 **URL(web API)語法**。
兩條路走同一個引擎、改同一份 `flow.yaml`,可任意混用。

> 場景總索引在 [../README.md](../README.md);新手先讀 [../../getting-started.md](../../getting-started.md);CLI 完整參考在 [../../cli/](../../cli/)。

## 索引

| 文件 | 內容 |
|---|---|
| [create.md](create.md) | 五大建立動作總覽:專案 / 工作流 / 節點 / 連線 / 輸入欄位 |
| [create-ai.md](create-ai.md) | 建立 `ai` 節點(呼叫模型) |
| [create-cmd.md](create-cmd.md) | 建立 `cmd` 節點(跑 shell 指令) |
| [create-assemble.md](create-assemble.md) | 建立 `assemble` 節點(純資料組裝,不呼叫模型;合併多條上游) |
| [create-input.md](create-input.md) | 建立 `input` 節點(執行期輸入欄位 / 觸發點) |
| [create-write.md](create-write.md) | 建立 `write` 節點(把結果寫到檔案) |
| [web-ui.md](web-ui.md) | **用瀏覽器介面**(非 curl)建立的完整操作走法 |

## 所有節點型別一覽

型別定義在 `src/engine/types.ts`;每型別的最小起始欄位是引擎的 `nodeStarter`
(`src/engine/node.ts`),驗證規則在 `src/engine/validate.ts`。

| 型別 | 一句話 | 執行模型 | 上游需求 | 必填 | 可選 |
|---|---|---|---|---|---|
| `ai` | 呼叫本機模型 | 每筆(per-item) | 0+ | `prompt` | `from`、`profile` |
| `cmd` | 跑 shell 指令 | 每筆 / 一次 | 0+ | `run` | `from`、`inputs`、`mode` |
| `assemble` | 純資料組裝,不呼叫模型(`from: [a,b]` 可合併多條上游) | 每筆 | 0+ | `prompt` | `from` |
| `input` | 執行期輸入欄位(觸發點) | 觸發 | **0(禁止 from)** | — | `params` |
| `write` | 把結果寫到檔案(成品) | 落地 | **1+** | `path` | `mode` |

> `ai` 另有選填的 `schema`(JSON `欄位→型別`):設了就把輸出解析+驗證成結構化物件,
> 不符自動重試一次再 fail。見 [create-ai.md](create-ai.md)。

> `ai`/`cmd`/`assemble` 都是每筆輸入跑一次。要合併兩條上游時,讓 `assemble`
> (或 `ai`)節點吃 `from: [a, b]`,在 prompt 裡分別引用兩邊。

## URL 語法的共通前提

`chainq ui` 開的 server 綁 `127.0.0.1`、**port 隨機**,啟動時印出:

```bash
chainq ui
# chainq ui → http://127.0.0.1:<PORT>/
```

下面各文件 URL 範例裡的 `<PORT>` 換成實際數字,`<FLOW>` 換成 flow.yaml 的**絕對路徑**。
建立節點的共通兩步:

1. `POST /api/add-node` 先建節點(只寫該型別的 starter 欄位)。
2. `POST /api/set` 逐欄補上型別專屬設定(或 `POST /api/save` 直接存整份 YAML)。
   接線用 `POST /api/connect`。

對應程式碼:URL API 在 `src/web/server.ts`,CLI 在 `src/cli/index.ts`。
