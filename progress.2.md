# Lane A 進度圖 — web input + 參數契約（P1-a）

> 格式沿用 `draft.md`(能力與缺口圖):**統一圖例 + 第一部盤點表 + 第二部狀態樹**。對代碼核實。
> 統一圖例:✅ 已完成 · 🟡 進行中 · ❌ 未完成 · ⛔ 不做(寫理由)· ⚠️ 風險。
> **一句話結果**:`draft.md` 標 ❌ 的 **P1-a「input 在 web 用不了」** 洞已補上——web 現在能填**有型別的參數**驅動 `input` 節點、**必填沒填會擋下**、輸出反映剛填的值、快取也反映所選輸入(消滅「✓ ran 卻跑空」)。並把 input 參數契約(`type`/`required`)升級成 **CLI 與 web 共用同一支驗證**。`run.ts` 一行沒碰 → 與 Lane B(lineage)零衝突。

---

# 第一部 — 模組盤點

| 區 | 模組 | 功能 | 錨點(實作/測試) | 完成度 |
|---|---|---|---|---|
| 引擎 | input(新檔) | `parseVal`·`coerceParam`·`coerceInput`·`validateRunInput`·`staticParamErrors`——CLI 與 web 共用一套解析/驗證 | `src/engine/input.ts` / input.test×6 | ✅ |
| 引擎 | types(ParamSpec) | 加 `type`(string\|number\|boolean)+`required`,皆 optional → 舊流程不變 | `types.ts` | ✅ |
| 引擎 | validate | 加 input 靜態契約:`type` 字面值合法 · `default` 符合宣告型別 | `validate.ts` → `staticParamErrors` / validate×7 | ✅ |
| CLI | run gate | 組好 `--input` 後接 `validateRunInput`,required/型別不符就擋、不跑 | `src/cli/index.ts` / e2eCli 15檔·42測 | ✅ |
| 網頁 | server.ts | `/api/parse` 吐 `params` · `/api/run(-node)` 收 `input` · `streamRun` server 端 coerce + `validateRunInput` · `CHAIN_NO_OPEN` 自動化不開預設瀏覽器 | `server.ts` / server.test×4 | ✅ |
| 網頁 | 面板 D — input 表單 | 依型別畫 widget(number/checkbox/text)+ **必填標記** + 預填 default | `app.js` `renderParamsForm`/`selectNode` | ✅ |
| 網頁 | run 失敗清狀態 | 被契約擋下的 run 不再讓節點卡「running…」 | `app.js` `clearRunning` | ✅ |

> 凡 🟡/❌/⛔ 開子表拆細項 ↓

### 子表:`input` 節點在 web 可用（draft.md 的 ❌ 全數翻 ✅）

| 細項 | 之前 | 現在 | 錨點 |
|---|---|---|---|
| web 傳 input | ❌ `/api/run` 建 Runner 沒帶 input | ✅ `/api/run(-node)` 讀 body.input → `streamRun` → `new Runner({input})` | `server.ts` streamRun |
| 面板填參數 | ❌ 無表單 | ✅ input 節點面板畫 params 表單 | `app.js` renderParamsForm |
| ⚠️ 靜默空輸入風險 | ⚠️ web 跑 input → `[{}]`,還快取成「✓ ran」 | ✅ 已解:空表單送 `undefined`,`coerceInput` 把全空收斂成 undefined → 與「無輸入」共用同一個 Merkle key | `input.ts` coerceInput |
| 型別解析 | (只有 CLI 的 parseVal) | ✅ web 照抄 CLI 的 `parseVal`(JSON-or-string)、共用同一支函式 | `input.ts` parseVal |

### 子表:input 參數契約 type/required（新增,CLI/web 共用）

| 細項 | 說明 | 錨點 | 完成度 |
|---|---|---|---|
| 宣告型別 | `type` 宣告 → 繞過 parseVal,直接 coerce 成該型別(`type:"string"` 收到 `42` 仍是字串) | `input.ts` `coerceParam` | ✅ |
| 必填 | `required` 沒給值又沒 default → 報錯(CLI 與 web **同一句**) | `input.ts` `validateRunInput` · 兩 gate | ✅ |
| 靜態契約 | `type` 字面值非法 / `default` 與型別不符 → `validate(flow)` 擋(壞不落地) | `validate.ts` `staticParamErrors` | ✅ |
| 兩個 gate 共用 | CLI run(`chain validate` 後)與 server `streamRun`(建 Runner 前)都呼叫 `validateRunInput` | `cli/index.ts` · `server.ts` | ✅ |
| 批次(多組值) | Runner 已支援 `Record[]` batch,但 web 表單只送單組 | — | ⛔ 延後(單組已達 P1-a 目標;UI 未接) |

---

# 優先級（這條線之後）

| P | 工作 | 為什麼 | 依賴 |
|---|---|---|---|
| ~~P1-a~~ ✅ | **input 在 web 可用 + 型別/必填契約** | **本線完成**:web 能用有型別的真參數驅動 input、required 擋下、快取反映輸入 | 已合 #10·#11 |
| **P1-b** | **逐項面板**(`/api/items`) | P1-a 之後 input 才有真料餵進來,逐項面板才看得到內容 | 後端齊 |
| **P2-a** | 型別專屬編輯器(field/mode/key;修 saveNode) | splitOut/merge 加得出來但設定不了 | 後端齊 |
| **P2-b** | 拖拉連線(`/api/connect`) | 編輯手感大躍進 | 後端齊 |
| **P3** | 位置持久化 · 前端 `@ts-check`+拆檔 · render 預覽非 ai | 體驗/維護性 | — |

---

# 第二部 — 狀態架構樹

依賴方向:**②CLI 與 ③網頁 都建在 ①引擎 之上,永不寫兩套**;本線新增的 input 契約就放在 ①,兩邊共用。

### ① 共用核心新增:input 契約　src/engine/input.ts　✅

```
        ① 核心引擎 src/engine ── input.ts（新）  ✅  唯一真相
                   │   （②CLI 與 ③網頁 都呼叫它,不可能漂走）
     ┌─────────────┼───────────────┬────────────────┐
     ▼             ▼               ▼                ▼
  parseVal     coerceParam      coerceInput     validateRunInput
  JSON-or-     宣告type→繞過    全空→undefined   required/型別
  string       parseVal coerce  (共用 no-input    (runtime 值檢查)
  ✅           ✅               cache key) ✅     ✅
                                              + staticParamErrors
                                                (靜態契約,validate 用) ✅
   註:types.ts ParamSpec 加 type/required(optional,向後相容);
      run.ts 未碰 → 與 Lane B(feat/lineage)零重疊
```

### ② CLI　src/cli　✅（run gate 接上契約）

```
        ② CLI src/cli ──► chain run
                              │  validate(flow) 靜態
                              ▼  → validateRunInput(flow, flags.input)  ✅
                          required/型別不符 → 報錯、不跑(與 web 同訊息)
              測試:e2eCli 15檔·42測 綠 ✅
```

### ③ 網頁　src/web　input 那塊 ❌ → ✅

```
        ③ 網頁 src/web
              │
      ┌───────┴────────────────┐
      ▼                        ▼
   server.ts ✅            編輯器 ui/app.js
   /api/parse 吐 params         │
   /api/run(-node) 收 input  ┌──┴─────────────┐
   streamRun:               ▼                ▼
     coerce + validateRun   面板 D          input 參數表單 ✅
     → new Runner({input})  rename/IO       依型別 widget
   CHAIN_NO_OPEN 不擾瀏覽器  ✅              (number/checkbox/text)
   ✅                                       + 必填標記 + 預填 default
                                            被擋的 run 不卡 running ✅
        測試:server.test×4 · browser e2e editor+input×2(headed 演過)✅
        ❌→✅:input 連後端 run 都傳到了,面板也填得了、型別/必填都管得住
```

---

> **驗證(全綠)**:`tsc` 乾淨 · `npm test` 97 過 · browser e2e(editor + input typed/required,headed 親演)· `e2e:cli` 42 過。
> **落地**:#10(web 接線)已合 main;#11(type/required 契約)已開,本線兩增量皆對最新 main 驗過、`run.ts` 未碰。
