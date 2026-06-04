# chain — 編輯器與 CLI 盤點（draft · 討論用）

> 目的：把「目前有哪些頁面、UI 有哪些模組、CLI 有哪些指令」攤平給人看清楚。
> 架構可調整。本檔只描述**現況**＋標出缺口，不是最終設計。

---

## 1. 頁面清單（repo 裡所有 HTML 頁）

目標是**唯一編輯器**：只有 `src/web/app.html` 該留，其餘都是臨時/文件頁。

| 頁面 | 路徑 | 用途 / 功能 | 是產品? | 狀態 |
|---|---|---|---|---|
| **編輯器（唯一）** | `src/web/app.html` | 視覺化編輯 + 跑流程；`chain ui` 開啟 | ✅ 是 | **保留** |
| E2E 視覺化器 | `e2e-viz.html` | 唯讀展示 6 步快取行為；自帶一套畫圖程式（與編輯器重複） | ❌ 測試/展示 | 建議刪* |
| fan-in 展示 | `fan-in-viz.html` | 唯讀展示 fan-in 拓樸（上輪臨時做的） | ❌ 否 | 建議刪 |
| 設計線稿 | `docs/iteration-pane-wireframe.html` | 早期手刻 UI 線稿，`design.md` 引用 | ❌ 文件 | 文件用，可留 |

\* `e2e-viz.html` 被 `e2e/browser/viz.spec.ts` + `playwright globalSetup` 綁住（目前**唯一**的瀏覽器測試）。
  要刪它，得先把 UI 測試改成驅動真編輯器 `chain ui`，否則 UI 端就沒有自動化測試。

---

## 2. 唯一編輯器（app.html）的 UI 模組

`app.html` 是單頁、三個狀態（state）。每個模組對應到 `server.ts` 的一個 API，後端重用同一個 engine。

| # | 模組 | 位置 | 功能 | 後端 API | 完成度 |
|---|---|---|---|---|---|
| A | 流程選擇 | `#create` | 選資料夾、列出 .yaml、新建流程 | `/api/list` `/api/create` | ✅ |
| B | 頂列工具 | `.bar` | ← 返回、路徑、`{ } raw` 切換、profile pill、`▷ Run all`、`↻ fresh` | `/api/run` | ✅ |
| C | 畫布 canvas | `#graph` | 真實 DAG 渲染（依深度分欄 + 連線顯示 fan-out/fan-in）、點節點開面板、每節點 `▷/↻` 跑、`+ add ai step` | `/api/parse` `/api/run-node` | 🟡 渲染✅ / 編輯弱 |
| D | 節點面板 | `#modal`（3 欄） | **INPUT**：from 連線 + 各上游輸出　**PROMPT**：模板 + 代入後即時預覽　**OUTPUT**：狀態/結果。按鈕：Run to here / re-run / Save / delete / close | `/api/render` `/api/set` `/api/set-from` `/api/delete-node` `/api/run-node` | ✅ |
| E | 原始 YAML | `#rawView` | 直接編輯整份 YAML、Save（validate 後才寫） | `/api/read` `/api/save` | ✅ |

### 模組 C（畫布）細項功能 — 缺口在這

| 功能 | 說明 | 完成度 |
|---|---|---|
| 渲染真實 DAG + 連線 | 分欄 + 曲線連線，看得到 fan-in | ✅ 上輪剛補 |
| 點節點 → 開面板 | 進模組 D 編輯 | ✅ |
| 每節點 run-to-here / re-run | 卡片上的 `▷` `↻` | ✅ |
| 新增節點 | `+ add ai step` | ✅ |
| 刪節點 | 在面板 delete（下游還依賴會擋） | ✅ |
| **拖拉連線**（drag-to-connect） | 拉一條線寫回 `from:`；現在只能在面板打逗號 `node1, node2` | ❌ 缺 |
| **節點改名**（inline rename） | 改 key + 下游 from 連動；現在要進 raw YAML | ❌ 缺 |
| **記住節點位置**（layout.json） | 拖動排版可留存，不污染 flow YAML（design T12） | ❌ 缺 |
| **items 數 badge（×N）** | 節點/連線顯示跑了幾個 item；引擎已回傳 `Item[]`，UI 沒畫 | ❌ 缺（本次重點） |
| **認得 splitOut/aggregate/merge** | UI 只認 ai/cmd；`+add` 只加 ai；render 預覽只給 ai。三型要給專用形狀 + 能新增/連線/寫回 YAML | ❌ 缺（本次重點） |
| **面板逐項顯示** | 點節點看 `item[0..N]` 各自輸入/輸出（n8n 風 ×N 面板） | ❌ 缺（本次重點） |
| 離線開關（fake/real profile） | 設計已鎖「一律真實 `claude -p`」 | ⛔ 作廢（不做） |

---

## 3. CLI 指令清單 + 目前狀態

> 更新（2026-06-04，對代碼核實）：items 模型 + Split Out/Aggregate/Merge + cmd `perItem` **引擎全做完**（`run.ts`/`validate.ts` 實作齊、`e2eCli/scenarios/` 各情境有測、CLI 顯示 `(N items)`、typecheck 綠）。**指令層與引擎已無缺口；缺口整個搬到 UI**——見 §2 模組 C：`app.html` 只認得 ai/cmd，不畫 items 數、不認 splitOut/aggregate/merge。
> ⚠️ 此批引擎工作**未 commit**（`src/engine/run.ts`、`types.ts` 已改；`e2eCli/`、`examples/fan-in-merge.yaml` 未追蹤）。

### 3a. 指令（都已完成 ✅）

| 指令 | 功能 | 旗標 | 完成度 |
|---|---|---|---|
| `chain init [dir]` | 鷹架新專案（`claude -p` profile）+ .gitignore + input.txt | `--force` | ✅ |
| `chain new <name>` | 在現有專案再加一條流程（2 節點起手 yaml） | — | ✅ |
| `chain ui [flow.yaml]` | 開編輯器；給檔名就直接進該流程 | — | ✅ |
| `chain ls [dir]` | 列出目錄下所有流程 yaml | — | ✅ |
| `chain validate <flow>` | 跑前靜態檢查（DAG/環/profile/prompt 引用必接線），不呼叫模型 | — | ✅ |
| `chain run <flow>` | 跑整條鏈，重用快取 | — | ✅ |
| `  ` ↳ `--fresh` | 忽略快取，全部重跑 | | ✅ |
| `  ` ↳ `--from <node>` | 強制重跑該節點 + 所有下游 | | ✅ |
| `  ` ↳ `--to <node>` | 只跑到該節點（上游用快取）= n8n run-to-here | | ✅ |
| `  ` ↳ `--steps <n>` | 只跑前 N 個節點 | | ✅ |
| `  ` ↳ `--pin <node>=<file>` | 把樣本釘成該節點輸出，trial 跑進 scratch（不動真輸出） | | ✅ |
| `  ` ↳ `--profile <name>` | 覆蓋所有 ai 節點的 profile（換用 flow 裡定義的另一個本機模型） | | ✅ |

### 3b. 節點型別 — 目前狀態

| 型別 | 作用 | 完成度 |
|---|---|---|
| `ai` | 對每個輸入 item 各跑一次模型（items 模型逐項） | ✅ |
| `cmd` | 跑 shell 指令；`mode: once`(預設) / `perItem`(逐項跑、stdin 餵 item) | ✅ |
| `assemble` | 純模板組裝資料、不呼叫模型 | ✅（保留，不被 Aggregate 取代） |
| `splitOut` | 一個含陣列的 item → 多個 item（fan-out）；可選 `field` | ✅ |
| `aggregate` | 多個 item → 一個含陣列的 item（fan-in）；空輸入吐 `[]` | ✅ |
| `merge` | 兩條輸入流合併：`append` / `byPosition` / `byKey`(需 `key`) | ✅ |

### 3c. 編排情境 — 目前狀態

| 情境 | 支援? | 備註 |
|---|---|---|
| 線性接力 a→b→c | ✅ | |
| 分岔 fan-out（一個上游餵多個下游） | ✅ | |
| 多輸入 fan-in（`from:[a,b]` + `$('id')`） | ✅ | 之後會遷成 **Merge 節點**（T7），現有 fan-in.yaml 屆時改寫 |
| compose 合併（`assemble`） | ✅ | |
| **items 資料模型**（線=items 串、節點逐項跑） | ✅ | 輸出 `Item[]`、逐項執行、向後相容、CLI 顯示 `(N items)` |
| **loop / 對清單每項各跑** | ✅ **通了** | `array → splitOut → cmd perItem → aggregate`，端到端離線 E2E 過 |
| 分批 / 限流（Loop Over Items） | ❌ | 延後（T9） |

**一句話**：指令齊、items 模型齊、**loop 通了**（splitOut/aggregate/merge/cmd perItem 都做完，14 個離線 CLI E2E 全綠）。剩 Loop Over Items（分批）延後。詳見 `docs/design/2026-06-04-loop-and-scenarios.md`。

---

## 4. 架構草圖（可調整）

```
   一份 YAML（唯一真相）
          │
     src/engine（唯一引擎：parse · Merkle 快取 · run · validate）
          │
   ┌──────┴───────┐
  CLI            src/web（server.ts 薄 API + app.html 單頁）
 chain run/...    chain ui → 模組 A~E
```

- **一個 engine、兩個呼叫端（CLI / UI）**，永不寫兩套邏輯。
- 結構改動（連線/改名/刪）都走「保留註解寫回 YAML + validate + 壞不落地」。
- 可調整點：模組 C 是否引入 React Flow（design T10 原規劃）還是延用目前 vanilla 畫布；
  layout 是否落 sidecar。（無 fake/offline 模式：產品一律真實 `claude -p`）

---

## 5. 待補一覽（缺口已全在 UI / 編輯器畫布）

**A. items 模型呈現（引擎已就緒，UI 空白）**
1. items 數 badge（×N）：節點/連線顯示 item 數
2. 認得 splitOut/aggregate/merge：專用形狀 + `+add` 能選型別 + 連線/寫回 YAML
3. 面板逐項顯示 `item[0..N]` 的輸入/輸出

**B. 畫布編輯手感**
4. 拖拉連線 drag-to-connect → 寫 `from:`
5. 節點 inline rename（key + 下游連動）
6. layout.json sidecar（記位置，不污染 flow YAML）

**C. 測試與清理**
7. UI 自動測試改去驅動真編輯器 `chain ui`（前提：先處理 e2e-viz 那套）
8. 臨時頁刪除（e2e-viz / fan-in-viz + 對應 scripts/指令）

---

## 待你決定 / 討論

- [x] ~~CLI/引擎缺口~~ → 已核實：引擎全做完，缺口整個在 UI（已更新本檔）
- [ ] 架構：vanilla 畫布繼續疊，還是換 React Flow？（會決定 A/B 的實作量；本次 office-hours Phase 4 處理）
- [ ] 頁面：臨時頁（e2e-viz / fan-in-viz）刪不刪？`e2e-viz` 那套測試改驅動真編輯器還是先凍結？
- [ ] 未 commit 的引擎工作要先 commit 再開 UI 分支，還是一起帶？
