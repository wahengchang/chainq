# CLAUDE.md — chain

`chain`：把一串 prompt 寫在一個 YAML 檔，跑在**本地 CLI 模型**（`claude -p`、`codex -m`）當子行程，不用 API key。核心價值是**迭代迴圈**：改一個 prompt → 只重跑受影響的節點 + 下游 → 看結果，未變動的步驟用快取重用（Merkle 失效）。

---

## 給 Claude 的工作規則（重要，務必遵守）

### 1. 前端品質是第一優先（the user cares deeply about the frontend）
這個專案的使用者對**畫面/互動**非常執著。動 UI 時：
- 行為要符合直覺。**按鈕做一件事**：`▷` run 按鈕只負責「跑 + 在卡片上就地顯示結果」，**絕不**順便打開編輯 modal；點卡片本體才開編輯面板。兩者不可混淆。
- 狀態要看得見：跑的時候要有 `◌ running…`、跑完要有明確結果與 `✓ ran · called the model` / `⊘ cached · reused` 徽章。不要讓使用者以為「按了沒反應」。
- 真實 vs 快取要分得清楚。瞬間回應通常是快取（`⊘`），不是沒跑。
- 主檔：`src/web/app.html`（單頁 UI）、`src/web/server.ts`（本地 http server，無框架）。

### 2. 每次更新後，跑一次畫面給使用者看（ALWAYS show the screen）
**只要動了 UI，改完一定要用 Playwright headed + 慢動作跑一次對應的 e2e**，讓使用者親眼看到瀏覽器自己操作、確認真的有效——不要只回報「passed」就結束。

```bash
SLOWMO=700 npx playwright test e2e/ui/run.spec.ts --headed
```

- 用 **headed**（會在使用者螢幕開真的瀏覽器），不是 headless。
- 用 `SLOWMO`（700–900）讓每個動作看得清楚（否則 1.9s 一閃而過）。
- 動到「跑節點 / 真的呼叫模型」的功能，要跑 `e2e/ui/run-real.spec.ts`（用真的 `claude -p`，會驗證真的有 spawn `claude` 子行程）。
- 改完 UI 後**重啟 server**（`APP_HTML` 在啟動時讀一次，不重啟看不到新版）並把新網址告訴使用者。

> 一句話：**每個 UI 改動 = 改 code + 更新 e2e + headed 跑一次給我看 + 重啟並給我網址。**

---

## 怎麼跑（環境陷阱）

- **永遠用 `npx tsx`，不要用 `node`。** import 路徑寫 `.js` 但其實指向 `.ts`，`node` 會 `ERR_MODULE_NOT_FOUND`。凡是想打 `node` 的地方都改打 `npx tsx`。
- CLI：`npx tsx src/cli/index.ts <init|new|ui|run|validate|ls>`
- Web UI：`npx tsx src/cli/index.ts ui [flow.yaml]`（綁 127.0.0.1，啟動時印網址）
- 單元測試：`npm test`（vitest）
- 瀏覽器 e2e：`npm run e2e:ui:headed`（看畫面）、`npm run e2e:ui`（Playwright UI 模式可逐步重播）
- 型別檢查：`npm run typecheck`
- macOS 在非 HFS 外接碟會產生 `._*` AppleDouble 檔，會打斷 glob——測試設定已用 `**/._*` 排除，別移除。

## 程式結構

- `src/engine/` — 引擎（CLI 與 UI 共用，唯一邏輯所在）：`dag` 拓樸/環檢測、`cache` Merkle 失效（upstream 順序有意義，**勿 sort**）、`run` Runner（每次操作獨立 `RunCtx`）、`render` 變數代入、`plan` 先預測再執行（不燒額度先給 preflight）、`proc` 子行程。
- `src/cli/` — 薄包裝，無引擎邏輯。
- `src/web/` — 本地 UI server + `app.html`。
- `e2e/` — Playwright（`e2e/ui/`）+ fixture-driven CLI e2e。

## 慣例

- 跑出來的東西「壞不落地」：寫檔前一定先 `validate`，驗證失敗回 400 不寫檔。
- 改 YAML 用 `yaml` 的 `parseDocument` + `setIn`/`deleteIn` 保留註解與排版。
- 快取行為：未變動節點重跑會瞬間回快取（`⊘`），這是設計，不是 bug；要強制真的呼叫模型用 `--fresh`（CLI）或 UI 的 `↻ re-run`。
