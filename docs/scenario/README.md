# scenario/ — 場景式操作教學

每份文件針對「一個具體場景」,同時給 **CLI 指令** 和 **URL(web API)語法**。
兩條路走同一個引擎、改同一份 `flow.yaml`,可任意混用。

> 新手先讀 [../getting-started.md](../getting-started.md);CLI 完整參考在 [../cli/](../cli/)。

## 建立各種元件(單一動作)

進 [creation/](creation/README.md) — 涵蓋專案 / 工作流 / 連線 / 輸入欄位,以及**全部 5 種節點型別**各自的建立教學。

| 文件 | 內容 |
|---|---|
| [creation/create.md](creation/create.md) | 五大建立動作總覽 |
| [creation/create-ai.md](creation/create-ai.md) | `ai` 節點(呼叫模型) |
| [creation/create-cmd.md](creation/create-cmd.md) | `cmd` 節點(跑 shell 指令) |
| [creation/create-assemble.md](creation/create-assemble.md) | `assemble` 節點(純資料組裝,不呼叫模型;合併多條上游) |
| [creation/create-input.md](creation/create-input.md) | `input` 節點(執行期輸入欄位 / 觸發點) |
| [creation/create-write.md](creation/create-write.md) | `write` 節點(把結果寫到檔案) |
| [creation/web-ui.md](creation/web-ui.md) | **用瀏覽器介面**建立的完整操作走法 |

## 所有節點型別一覽

型別定義在 `src/engine/types.ts`;最小起始欄位是引擎的 `nodeStarter`
(`src/engine/node.ts`),驗證規則在 `src/engine/validate.ts`。

| 型別 | 一句話 | 執行模型 | 上游需求 | 必填 | 可選 |
|---|---|---|---|---|---|
| `ai` | 呼叫本機模型 | 每筆(per-item) | 0+ | `prompt` | `from`、`profile` |
| `cmd` | 跑 shell 指令 | 每筆 / 一次 | 0+ | `run` | `from`、`inputs`、`mode` |
| `assemble` | 純資料組裝,不呼叫模型(`from: [a,b]` 可合併多條上游) | 每筆 | 0+ | `prompt` | `from` |
| `input` | 執行期輸入欄位(觸發點) | 觸發 | **0(禁止 from)** | — | `params` |
| `write` | 把結果寫到檔案(成品) | 落地 | **1+** | `path` | `mode` |

> `ai`/`cmd`/`assemble` 都是每筆輸入跑一次。要合併兩條上游時,讓 `assemble`
> (或 `ai`)節點吃 `from: [a, b]`,在 prompt 裡分別引用兩邊。
>
> `ai` 另有選填 `schema`(JSON `欄位→型別`):設了就把輸出解析+驗證成結構化物件,
> 不符自動重試一次再 fail。

對應程式碼:URL API 在 `src/web/server.ts`,CLI 在 `src/cli/index.ts`。
