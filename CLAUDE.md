## 專案是什麼

**chainq** — 在「一個 YAML 檔」裡定義多步驟 prompt chain,跑在本機 CLI 模型上(`claude -p`、`codex -m`),不用 API key、不走 HTTP。可從終端機跑,也可開視覺編輯器拖拉。一個 flow 就是一張由 step(node)組成的小型 DAG。

## 指令(本機是 bun-only,node/npm/npx/tsc/gh 都不在非互動 shell 的 PATH)

> ⚠️ 不要照 `package.json` 直接打 `npm run …`——腳本內部會再呼叫 npm 而失敗。一律用 bun。詳見 memory `toolchain-quirks`。

```bash
bun run dev <args>          # 跑 CLI(= tsx src/cli/index.ts),例:bun run dev run flow.yaml
bun run ui flow.yaml        # 開視覺編輯器(127.0.0.1 隨機埠)
bun run test                # 單元測試(vitest)
bun run e2e                 # CLI e2e(vitest.e2e.config.ts)
bun run build               # 編譯到 dist/(含複製 app.html / ui/*.js)
bunx tsc --noEmit                          # typecheck(主程式)
bunx tsc -p src/web/ui/tsconfig.json       # typecheck(UI)

# Playwright UI e2e:spawn 出的 tsx 需要 node,先補 PATH 再跑
export PATH="$HOME/.nvm/versions/node/v24.13.1/bin:$PATH"
SLOWMO=850 node_modules/.bin/playwright test e2e/browser/<spec>.spec.ts --headed

# 開 PR(gh 不在 PATH)
/opt/homebrew/bin/gh pr create …
```

## 架構

```
src/engine/   ← 唯一真相來源:純引擎(parse / validate / DAG / cache / run)。
              公開介面只走 engine/index.ts;CLI 與 UI 都從這裡 import,
              絕不碰內部模組、絕不另寫一套(「永不寫兩套」)。
src/cli/      ← 薄殼:run · validate · ls · init · new · ui。無引擎邏輯。
src/web/      ← 本機 web server(Node 內建 http,零依賴,綁 127.0.0.1)
              + 單頁編輯器:server.ts、app.html、ui/app.js。
```

- **Flow = 一個 YAML 檔**:具名 steps + model profiles。**node 的 id 就是 YAML key**。畫布座標不進 flow,另存 `.chain/layout.json`。
- **Step 種類**:`ai` · `cmd` · `assemble`(逐 item)· `splitOut` · `aggregate` · `merge`(整批 collection 運算)· `input`(觸發源)· `write`。沿用 n8n 的 items 模型。**刻意不做 `loop` 容器**(splitOut→鏈→aggregate 已可表達,見 idea-gap.md)。

## 眉角(Gotchas)

- **改了 `app.html` / `ui/*.js` 一定要重啟 server**:server 啟動時只讀一次 `APP_HTML`,不重啟就是演舊版。
- **`cmd` node 預設不可快取**(VOLATILE,每次重跑);要可快取必須宣告 `inputs:`(內容雜湊折進 cache key)。
- **`run` 預設整條重跑**;`--cache` 才重用未變動的 node 輸出。
- **UI e2e 慣例**:每個 spec 自己 spawn `tsx CLI ui flow.yaml`(帶 `CHAIN_NO_OPEN=1`)→ 永遠讀最新 app.html;切換 node 面板前先 `page.keyboard.press("Escape")`,否則開著的 modal 會攔截點擊。

## 工作原則

0. **你只說繁體中文。**

1. **前端體驗是第一優先。** 本專案重度依賴 UI 操作,網頁端表現直接決定產品價值。取捨一律站在使用者視角。

2. **每個 UI 改動都要用 Playwright 實測,並親眼看到互動跑過。** UI 極易損壞、交互複雜;不要只回報「passed」,實際跑過一次才算數。

3. **可信來自可觀察,而非斷言。** 內部正確不等於已交付——狀態與結果都要是使用者能當場確認的。

4. **一個操作只做一件被預期的事。** 不在使用者沒要求時觸發隱性副作用;可預測優先於聰明。

5. **交付要還原現場。** 改完即可被看到、確認、接續使用,才算完成。

6. **善用本機已安裝的 gstack。** 執行工作前,先 review gstack 的指令(如 `/plan-eng-review`、`/review` 等),在合適環節納入使用。

## 完成的定義(動到 UI 就必須做到,否則不算完成)

任何 UI 改動,結束回合前必須:

1. 用 Playwright **headed + SLOWMO(700–900)** 跑對應的 e2e——讓 Playwright **自動彈出真的瀏覽器、自己操作**這次改動的互動給我看,我不需要手動開任何東西。
2. **不接受只回報「passed」或只給我網址**;要 Playwright 自動驅動瀏覽器,讓我親眼看到它自己跑一遍。
3. 視覺化要反映**真實狀態**(跑真引擎、真資料),不是寫死的示意流程。
4. 跑之前先重啟 server(`APP_HTML` 啟動時讀一次),確保演的是最新版。

> 規則:不是給我網址叫我自己看,而是 Playwright 自動開瀏覽器、自動操作演一遍給我看。做完不是終點,「自動演過一次」才是。

## 文件慣例:能力與缺口地圖(Capability & Gap Map)

在《能力與缺口圖》是基於統一圖例的兩部分狀態文檔，用於盤點系統當前狀況和暴露缺口。
第一部 — 模組盤點（表格）
依工作類型分割模組，以表格逐項列出：模組｜功能｜對應實作(錨點)｜完成度。每一列必須同時具備兩樣：完成度圖示+可驗證重點（文件/API／指令／測試／證據）－沒有要點的 ✅一律不數。凡標 🟡 或 ❌ 的項目，另外須開子表拆出細項。
第二部分 — 狀態架構樹（Status Tree）
為每個頂部生成一棵棵樹，把系統依模組逐層拆解。 每個節點須標明完成進度+規模數量+測試覆蓋；樹根鬚唯一資訊來源與依賴方向（各部分模組共用同一核心、誰依賴誰）。
統一圖例（兩部分割）：
✅ 已完成 · 🟡 進行中（契約「X 齊／Y 待接」）· ❌ 未完成 · ⛔ 不做（寫明理由）· ⚠️ 風險。
文件僅在以下五項同時滿足時才算有效：
每葉節點都帶狀態圖示；每項都引用可檢查物件（無某一點的 ✅ 無效）；每個樹根都指明資訊來源與依賴流向；用一句話點出差距集中處；兩部分使用同一套圖例。