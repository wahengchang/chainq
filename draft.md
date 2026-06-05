# chain — 能力與缺口圖（Capability & Gap Map）

> 基於統一圖例的兩部分狀態文檔:**第一部=模組盤點(表格)**、**第二部=狀態架構樹**。對代碼核實,改完即更新。
> 統一圖例:✅ 已完成 · 🟡 進行中(契約「X 齊／Y 待接」)· ❌ 未完成 · ⛔ 不做(寫理由)· ⚠️ 風險。
> **一句話差距**:引擎 / CLI 100% 完成;**缺口全集中在「網頁畫布 UI 接線」**——後端端點多半已建+測,只差前端接上去(其中 `input` 節點在 web 完全用不了,是最緊的洞)。
> 三層分工:現況層=本檔 · 決策層=`docs/design/` + design doc · 交接=`HANDOFF.md`。

---

# 第一部 — 模組盤點

| 區 | 模組 | 功能 | 錨點(實作/測試) | 完成度 |
|---|---|---|---|---|
| 引擎 | types · dag | 資料模型(Item·7型別)· 拓樸/環 | `types.ts`·`dag.ts` / dag.test×6 | ✅ |
| 引擎 | run | items 逐項 · 集合運算子 · loop | `run.ts` / run×10·partial×4 | ✅ |
| 引擎 | render | `$json`/`$('id')` 取值 · rewriteRefs · paired-item | `render.ts` / render×14 | ✅ 基本／⚠️ 跨多跳(↓) |
| 引擎 | validate | 接線/環檢查 · 壞不落地安全網 | `validate.ts` / validate×7 | ✅ |
| 引擎 | cache | Merkle 快取 · rename 保 cache | `cache.ts` / cache×10 | ✅ |
| 引擎 | rename · node | 改 key+下游連動 · nodeStarter · id 白名單 | `rename.ts`·`node.ts` / rename×13·node×6 | ✅ |
| 引擎 | plan · lock | 預跑 · FlowLock(跨 process) | `plan.ts`·`lock.ts` / plan×6·lock×2 | 🟡 lock 已建/未接線 ⚠️ |
| CLI | init·new·ls·validate·ui·run | 鷹架·檢視·靜態檢查·開編輯器·跑鏈(+6 旗標·`--input`/`--input-file`) | `src/cli/index.ts` / e2eCli 15檔·~40測 | ✅ |
| 網頁 | server.ts | 17 API 端點 + /ui 靜態 · per-flow mutex · editFlow 只擋新引入錯 | `server.ts` / server.test×2 | 🟡 端點齊／**input 未傳**(↓) |
| 網頁 | 編輯器 A 流程選擇 | 選資料夾·列·新建 | `app.js` / `/api/list`(非遞迴)·`/api/create` | ✅ |
| 網頁 | 編輯器 B 頂列 | raw 切換·Run all·fresh | `app.js` / `/api/run` | ✅ |
| 網頁 | 編輯器 C 畫布 | DAG 渲染·加節點(型別)·形狀·×N | `app.js` renderGraph/typeChip / `/api/parse`·`/api/add-node` | 🟡 渲染/加✅(↓) |
| 網頁 | 編輯器 D 面板 | INPUT/PROMPT/OUTPUT · rename | `app.js` selectNode / `/api/render`·`/api/rename` | 🟡 基本✅(↓) |
| 網頁 | 編輯器 E 原始 YAML | 編輯整份·validate 後存 | `app.js` / `/api/read`·`/api/save` | ✅ |
| 網頁 | 前端架構 | 原生 ES module · 零 build | `src/web/ui/app.js` + server /ui 路由 | 🟡 已模組化／`@ts-check`+拆檔待補 |

> 凡 🟡/❌ 開子表拆細項 ↓

### 子表:`input` 節點在 web 不可用（⚠️ 最緊,P1）

| 細項 | 說明 | 錨點 | 完成度 |
|---|---|---|---|
| 引擎支援 input | trigger 發種子 item(params+runtime) | `run.ts:207` · cache 折 `{params,input}` `cache.ts:72` | ✅ |
| CLI 餵 input | `--input` / `--input-file` | `src/cli/index.ts` | ✅ |
| **web 傳 input** | `/api/run(-node)` 把 runtime input 傳給 Runner | `server.ts:364` 建 Runner **沒帶 input** | ❌ |
| **面板填參數** | input 節點的 params 表單 | 無 | ❌ |
| ⚠️ 靜默空輸入風險 | web 跑 input 節點 → `[{}]` 只有預設值,還快取成「✓ ran」 | `run.ts:213` | ⚠️ 違反「可信來自可觀察」 |

### 子表:畫布 C / 面板 D 缺口（後端齊,只差 UI 接線）

| 細項 | 後端錨點(已建+測) | UI | 完成度 |
|---|---|---|---|
| 逐項面板 item[0..N] | `/api/items`(每節點 in/out 的 `Item[]`) | 面板未列出 | 🟡 後端齊／UI 待接 |
| 拖拉連線 drag-to-connect | `/api/connect`(JSON 陣列、保序) | 只能打逗號 | 🟡 後端齊／UI 待接 |
| 記住節點位置 | `/api/layout`(`.chain/layout/<flow>.json` per-flow) | 畫布仍 flex 自動排版 | 🟡 後端齊／UI(絕對定位)待接 |
| 型別專屬編輯器 | (validate 已認 field/mode/key) | `saveNode` 對非 cmd 一律寫 prompt | ❌ |
| render 預覽非 ai 型別 | `/api/render` | 只給 ai | 🟡 |

### 子表:paired-item 跨多跳 lineage（⚠️ 引擎已知限制,P-LINEAGE）

| 細項 | 說明 | 錨點 | 完成度 |
|---|---|---|---|
| single-hop 配對 | `$('id').item` 對「primary 的直接輸入 / 1:1 祖先鏈」正確(本 session codex 抓的靜默錯配已修) | `render.ts:30,119` · `pairing.e2e.ts` | ✅ |
| 多跳 lineage walk | 跨 `aggregate` / 兩層 fan-out 的正確配對 | 未實作(`render.ts` 註解標明) | ❌ ⚠️ 別假設 `$('id').item` 跨 aggregate 仍正確 |

---

# 優先級（下一步順序）

| P | 工作 | 為什麼 | 依賴 |
|---|---|---|---|
| **P1-a** | **input 在 web 可用** + 修靜默空輸入風險 | 閉合剛建的 input 節點(現在 web 用不了)、修「✓ ran 卻跑空」的可信風險 | 後端要改:`/api/run(-node)` 傳 input + 面板表單 |
| **P1-b** | **逐項面板**(`/api/items`) | 「編輯器看得見 items 模型」的另一半(現只見 ×N、不見內容);**P1-a 後才有真 input 餵進來、逐項才有料可看** | 後端齊 |
| **P2-a** | **型別專屬編輯器**(field/mode/key;修 saveNode) | splitOut/merge 加得出來但設定不了 | 後端齊 |
| **P2-b** | **拖拉連線**(`/api/connect`) | 編輯手感大躍進(像 n8n) | 後端齊 |
| **P3** | 位置持久化(`/api/layout`)· 前端 `@ts-check`+拆檔 · render 預覽非 ai | 體驗/維護性,非核心 | — |
| **P-LINEAGE** | paired-item 多跳 lineage walk(升級 single-hop) | 引擎已知限制:跨 `aggregate`/兩層 fan-out 會錯配,目前靠單跳擋住 | 引擎 |
| **延後/風險** | FlowLock 接線(跨 process)· Loop Over Items · `/api/list` 遞迴 | ⚠️/低頻 | — |

> **決策現況**:畫布架構已走「**原生 vanilla ES module**」(UI 已抽成 `ui/app.js`),**React Flow 未採用**。HANDOFF_2 把它列為「未決」,但實作已落地;P2 拖拉/位置若做起來太痛再議。

---

# 第二部 — 狀態架構樹

依賴方向:**②CLI 與 ③網頁 都建在 ①引擎 之上,永不寫兩套**。

### ① 共用核心引擎　src/engine　✅（14 模組 · 7 型別 · 78 單元測）

```
                    ① 核心引擎 src/engine  ✅   唯一真相
                              │  （②CLI 與 ③網頁 都呼叫它）
        ┌──────────────┬──────┴───────┬───────────────┐
        ▼              ▼              ▼               ▼
    資料模型        執行引擎        快取·驗證        結構編輯
        │              │              │               │
        ▼              ▼              ▼               ▼
    types · dag     run · render   cache · validate  rename · node
    7型別·拓樸      items·loop·    Merkle·壞不落地    改key連動·
    ✅ dag×6        $json·rewrite  ✅ cache×10·       id白名單
                    ✅ run×10·     validate×7        ✅ rename×13·
                    render×14                         node×6
                      （＋ plan×6 · lock×2 ⚠️ 未接線）
   註1:input 節點型別 ✅,但只有 CLI 餵得了參數,web 餵不了(見 ③)
   註2:render paired-item 只到 single-hop ⚠️;跨 aggregate/兩層 fan-out 的
        多跳 lineage 未做(P-LINEAGE),別假設 `$('id').item` 跨 aggregate 正確
```

### ② CLI　src/cli　✅（6 指令 · 15 e2e 檔 · ~40 測）

```
                      ② CLI src/cli  ✅
                  （全部下沉呼叫 → ① 核心引擎）
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
      鷹架·檢視            開編輯器               跑鏈
          ▼                   ▼                   ▼
    init·new·ls·          chain ui            chain run
    validate              → 開 ③ 網頁          重用 Merkle 快取
    ✅                    ✅                   ＋--input ✅·其他旗標✅
              測試:e2eCli/scenarios 15檔·~40測（含 input/pairing;真 claude gated）✅
```

### ③ 網頁　src/web　🟡（17 API · 5 模組 · 3 瀏覽器 e2e）

```
                      ③ 網頁 src/web  🟡
                （server 薄 API → ① 核心引擎,永不寫兩套）
                              │
              ┌───────────────┴────────────────┐
              ▼                                ▼
          server.ts  🟡                    編輯器 app.html / ui/app.js
        17 API + /ui 靜態                 （原生 ES module · 零 build）
        ✅ rename/add/connect/                 │
           items/layout/parse…       ┌─────────┼──────────┬──────────┐
        ❌ /api/run 不傳 input        ▼         ▼          ▼          ▼
                                  A/B/E     C 畫布      D 面板    input 參數
                                  ✅        ✅渲染·加節點 ✅ rename  ❌ 表單
                                            ·形狀·×N      🟡逐項      （P1-a）
                                            🟡拖拉/位置   (→items)
                                            (→connect/    ❌型別編輯器
                                             layout)
              前端 🟡 @ts-check+拆檔（現 window bridge）
              測試:editor.spec ✅ + run/run-real（真 claude, gated）✅
              🟡 = 後端端點已建+測,只差畫布 UI 接線；❌ input 連後端 run 都還沒傳
```
