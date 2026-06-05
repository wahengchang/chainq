# work.md — 兩個 worktree 並行計畫

> 來源:`draft.md`(能力與缺口圖)的優先級表。目標:兩條 worktree 同時跑、**零檔案衝突**。
> 現況:在 `main`,solo repo、直推 main(無 PR)。

## 拆解原則

幾乎所有 UI 工作都動同一個前端檔 `src/web/ui/app.js` → **兩條 UI 線並行會撞車**。
所以並行的安全切法是 **「網頁線 ∥ 引擎線」**(檔案不重疊),不是兩條 UI 線:

- **Lane A(網頁)** = P1-a:`input` 在 web 可用 + 修空輸入快取風險。動 `server.ts` + `ui/app.js`。
- **Lane B(引擎)** = P-LINEAGE:paired-item 多跳 lineage。只動 `render.ts` + `run.ts`。

兩條檔案集完全不重疊(見下「衝突分析」),可真正並行。

---

## Step 0 — 開工前(在 main 做一次)

```bash
# 1. 先把文件 commit,讓兩個 worktree 從乾淨 main 出發
git add draft.md CLAUDE.md work.md && git commit -m "docs: capability map + parallel work plan"

# 2. 開兩個 worktree(各自獨立目錄、獨立分支)
git worktree add ../chain-A-web   -b feat/web-input
git worktree add ../chain-B-lineage -b feat/lineage
```
之後:`cd ../chain-A-web`(Lane A)、`cd ../chain-B-lineage`(Lane B),各自 `npm i` 一次。

---

## Lane A — `feat/web-input`：input 在 web 可用（P1-a）

**目標:** 編輯器能餵 `input` 節點的 runtime 參數;跑出來反映輸入、快取正確;消滅「✓ ran 卻跑空」。

**檔案:** `src/web/server.ts` · `src/web/ui/app.js` · `src/web/server.test.ts` · `e2e/browser/editor.spec.ts`(或新 spec)

**任務**
- A1 `server.ts`:`/api/run` 與 `/api/run-node` 的 body 收 `input?: Record<string,unknown>[]`;在 `streamRun` 的 `new Runner({…, input})` 傳進去。
- A2 `server.ts`:`/api/parse` 的節點映射補 `params`(讓前端知道 input 節點要畫哪些欄)。
- A3 `ui/app.js`:input 節點面板畫 params 表單(從 `node.params`);收集值,跟著 run 呼叫一起送(`runAll`/`runTo`/`runNode` 都帶 input)。
- A4 `ui/app.js`:input 節點的型別 chip / 顯示(`TYPE_GLYPH` 已有 `▶ input`,確認渲染對)。

**測試**
- `server.test.ts`:`/api/run-node` 帶 input → 透傳到 Runner(離線,用 `input→assemble`,免 claude)。
- 瀏覽器 e2e:含 input 節點的 flow → 填參數 → 跑 → 輸出反映輸入(離線,input→assemble 不需模型)。

**驗收(CLAUDE.md 鐵則)**
- `SLOWMO=900 npm run e2e:ui:demo` headed:自動開瀏覽器,填 input、跑、看到輸出反映剛填的值。
- `npm test` + `npx tsc --noEmit` 綠。

**Done =** web 能用真參數驅動 input 節點、快取反映所選輸入、headed 演過一遍。

---

## Lane B — `feat/lineage`：多跳 paired-item（P-LINEAGE）

**目標:** `$('id').item` 跨 `aggregate` / 兩層 fan-out 仍配對正確(升級目前的 single-hop)。

**檔案:** `src/engine/render.ts` · `src/engine/run.ts` · `src/engine/render.test.ts` · `e2eCli/scenarios/pairing.e2e.ts`

**任務**
- B1 `run.ts`:沿 `pairedItem` 鏈做**多跳 lineage walk**,算出某下游 item 對某祖先節點的正確來源 index(取代目前只傳單跳 `pairedIndex`)。
- B2 `render.ts`:`$('id').item` 用 lineage 解析,而非單一 `pairedIndex`;**新欄位保持 optional**(見衝突分析)。移除 `render.ts:30` 的 single-hop 限制註解。
- B3 測試:`render.test.ts` 加多跳案例;`pairing.e2e.ts` 加「跨 aggregate」「兩層 fan-out」情境。

**驗收**
- `npm test`(80+ 單元)綠;`npm run e2e:cli`(離線 pairing 情境)綠;`npx tsc --noEmit` 綠。
- 重現 HANDOFF_2 §2 的 repro 不再錯配。

**Done =** 多跳配對正確、single-hop 註解移除、測試證明、全綠。
**風險:** lineage walk 比 single-hop 難(research-y);若卡住,維持現狀 + 把限制寫清楚也是可接受的中止點。

---

## 衝突分析（為什麼這兩條安全）

| | Lane A 動的檔 | Lane B 動的檔 |
|---|---|---|
| | `server.ts` · `ui/app.js` · `server.test.ts` · `e2e/browser/*` | `render.ts` · `run.ts` · `render.test.ts` · `e2eCli/scenarios/pairing.e2e.ts` |

**重疊 = 0。** 唯一耦合點:`server.ts` 會 `import { renderPrompt }`、並呼叫它(`server.ts:119`)。
→ **協調鐵則:Lane B 對 `RenderInputs` 的任何新增欄位都要 optional**(像現有 `pairedIndex?`),這樣 Lane A 的 `server.ts` 不必改、不會壞。只要守這條,兩條合併互不踩。

---

## 合併順序

1. 誰先綠先合誰回 `main`(都從乾淨 main 出發、檔案不重疊,順序無所謂)。
2. 後合的那條:`git rebase main` → 跑全套(`npm test` + `npm run e2e:cli` + `npm run e2e:ui:headless`)→ 綠才合。
3. 合完刪 worktree:`git worktree remove ../chain-A-web`(B 同理)。

---

## 兩條都合進 main 之後(循序,非並行)

接著走 `draft.md` 優先級表,**這些大多動 `ui/app.js`,要循序做**(不要再並行):
1. **P1-b 逐項面板**(`/api/items`)—— Lane A 完成後才有真 input 餵進來,逐項才有料可看。
2. **P2-a 型別專屬編輯器**(修 `saveNode`)→ **P2-b 拖拉連線**(`/api/connect`)。
3. **P3** 位置持久化 / 前端 `@ts-check`+拆檔 / render 預覽非 ai。
