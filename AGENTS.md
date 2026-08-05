## 專案是什麼

**chainq** — 在一個 YAML 檔裡定義多步驟 prompt chain，跑在本機 CLI 模型上
（例如 `claude -p`、`codex exec`），不用 API key、不走 HTTP。可從終端機執行，
也可開視覺編輯器拖拉。一個 flow 就是一張由 step（node）組成的小型 DAG。

## 指令

本機開發一律優先使用 Bun；CI 使用 Node 22 + npm，兩條路都必須保持可用。

```bash
bun run dev <args>          # 跑 CLI，例如：bun run dev run flow.yaml
bun run ui flow.yaml        # 開視覺編輯器（127.0.0.1 隨機埠）
bun run test                # 單元測試（Vitest）
bun run e2e                 # CLI e2e
bun run build               # 編譯到 dist/
bunx tsc --noEmit
bunx tsc -p src/web/ui/tsconfig.json

# Playwright UI e2e（互動驗證須 headed + SLOWMO）
SLOWMO=850 node_modules/.bin/playwright test e2e/browser/<spec>.spec.ts --headed
```

## 架構

```text
src/engine/   ← 唯一真相來源：parse / validate / DAG / cache / run。
              公開介面只走 engine/index.ts；CLI 與 UI 都從這裡 import，
              絕不碰內部模組、絕不另寫一套。
src/cli/      ← 薄殼：run · validate · ls · init · new · ui。無引擎邏輯。
src/web/      ← 本機 web server（Node 內建 http、零依賴、綁 127.0.0.1）
              + 單頁編輯器：server.ts、app.html、ui/app.js。
```

- **Flow = 一個 YAML 檔**：具名 steps + model profiles。node id 就是 YAML key。
  畫布座標不進 flow，另存 `.chain/layout.json`。
- **Step 種類**：`ai`、`cmd`、`assemble`、`input`、`write`。沿用 n8n 的
  items 模型；刻意不做 `loop` 容器。

## 眉角（Gotchas）

- 改了 `app.html` 或 `ui/*.js` 一定要重啟 server；server 啟動時只讀一次
  `APP_HTML`。
- `cmd` node 預設不可快取（VOLATILE）；要可快取必須宣告 `inputs:`。
- `run` 預設整條重跑；`--cache` 才重用未變動的 node 輸出。
- UI e2e 每個 spec 自己 spawn `tsx CLI ui flow.yaml`（帶
  `CHAIN_NO_OPEN=1`）。切換 node 面板前先按 Escape，避免 modal 攔截點擊。
- Flow 的 Claude/Codex profile 都把 prompt 經 stdin 傳入；CLI 的進度走
  stderr，最終模型內容必須保持在 stdout。

## 工作原則

0. 只使用繁體中文回覆。
1. 前端體驗第一優先，取捨站在使用者視角。
2. 每個 UI 改動都要用 Playwright 實測並親眼看到互動跑過；不能只回報 passed。
3. 可信來自可觀察，不只來自內部斷言。
4. 一個操作只做一件被預期的事，不引入未要求的隱性副作用。
5. 交付要還原現場：完成後能立即被看到、確認並接續使用。

## 完成的定義（UI 改動）

任何 UI 改動在結束前必須：

1. 用 Playwright headed + `SLOWMO=700–900` 跑對應 e2e，讓瀏覽器自動操作。
2. 不以單純 passed 或網址代替實際互動展示。
3. 視覺化反映真實引擎與資料，不使用寫死示意。
4. 測試前重啟 server，確保載入最新版前端。

## 文件慣例：能力與缺口地圖（Capability & Gap Map）

能力與缺口圖由兩部分組成：

1. **模組盤點表**：模組、功能、實作錨點、完成度；每列同時具有狀態圖示與
   可驗證證據。🟡 或 ❌ 必須另開子表拆解。
2. **狀態架構樹**：每個節點標示進度、規模、測試覆蓋；樹根指出唯一資訊來源
   與依賴方向。

統一圖例：✅ 已完成、🟡 進行中、❌ 未完成、⛔ 不做（附理由）、⚠️ 風險。
文件只有在每個葉節點有狀態、每項有可檢查物件、每個樹根有依賴流向、清楚指出
差距集中處，且兩部分使用同一圖例時才算有效。
