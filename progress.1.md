# Lane B 進度圖 — 多跳 paired-item lineage（P-LINEAGE）

> 格式沿用 `draft.md`(能力與缺口圖):**統一圖例 + 第一部盤點表 + 第二部狀態樹**。對代碼核實。
> 統一圖例:✅ 已完成 · 🟡 進行中 · ❌ 未完成 · ⛔ 不做(寫理由)· ⚠️ 風險。
> **一句話結果**:`draft.md` 那個標 ❌ 的 **P-LINEAGE** 洞已補上——`$('祖先').item` 現在跨**兩層 fan-out** 配對正確、跨 **aggregate** 收斂到第一列(有定義)。新欄位 optional,沒碰 Lane A。
> 分支:`feat/lineage` · commit `6669843` · 只動引擎 4 檔。

---

## 0. 先用真實數字看懂這個 bug(理解用,非規格)

流程:`seed → splitA → splitB → show`,show 裡寫 `{{ $('seed').item.tag }}`。

```
seed   :  [ {tag:X, ...},               {tag:Y, ...} ]          ← 兩列輸入
            │  └─展開成 2 個            └─展開成 1 個
splitA :  [ a(來自X), b(來自X),          c(來自Y) ]              ← 第一層 fan-out
splitB :  [ 1(來自a), 2(來自b),          3(來自c) ]              ← 第二層 fan-out
show   :  對 splitB 每一項跑一次,回頭問「我這項是哪個 seed 來的?」
```

| show 第幾項 | 正確答案 | 舊「單跳」答案 | 為什麼舊的錯 |
|---|---|---|---|
| 1(值 1) | **X** | X | 剛好對 |
| 2(值 2) | **X** | **Y** ❌ | 單跳只記「splitB→splitA 的 index=1」,卻拿這個 1 去 index `seed`,撞到 seed[1]=Y |
| 3(值 3) | **Y** | Y | 剛好對 |

- 舊的(single-hop):`["1|X", "2|Y", "3|Y"]` ← 中間那列靜默錯配
- 新的(multi-hop):`["1|X", "2|X", "3|Y"]` ✅

**關鍵點**:`pairedItem` 只記「我在我『直接上游』裡的第幾個」。隔一層還行(seed 剛好是 splitA 的直接上游),隔兩層那個 index 的「座標系」就不對了。修法=**一跳一跳往上走、把 index 重新換算**,而不是拿一個 index 硬套到兩層之外的節點。

---

## 第一部 — 模組盤點

| 區 | 模組 | 功能 | 錨點(實作/測試) | 完成度 |
|---|---|---|---|---|
| 引擎 | run · lineage | 沿 primary 脊椎逐跳 compose `pairedItem`,算祖先來源 index | `run.ts` `lineageOf()` | ✅ |
| 引擎 | render · 取值 | `$('id').item` 用 lineage 解析,退回單跳 | `render.ts` `resolveExpr` | ✅ |
| 引擎 | render · 介面 | `RenderInputs.lineage?`(**optional**,守 Lane A 耦合) | `render.ts:34-49` | ✅ |
| 測試 | render 單元 | lineage 壓過 pairedIndex · off-spine 退回 · 無 lineage 向後相容 | `render.test.ts`(+3) | ✅ |
| 測試 | pairing e2e | 兩層 fan-out · 跨 aggregate(離線,真跑) | `pairing.e2e.ts`(+2) | ✅ |
| 引擎 | 跨 lane 安全 | `server.ts` 沒直接呼叫 `renderPrompt`、新欄位又 optional | — | ✅ 零衝突 |

> 🟡/❌ 的細項開子表 ↓

### 子表:lineage walk 涵蓋範圍

| 情境 | 走法 | 結果 | 完成度 |
|---|---|---|---|
| 1-in-1-out 直鏈 | 無 fan-out,index 不變 | 跟以前完全一樣(零回歸) | ✅ |
| 單層 fan-out | 走一跳 | 對(本來單跳就對) | ✅ |
| **兩層以上 fan-out** | **逐跳 compose** | **對(本次修的主目標)** | ✅ |
| 跨 aggregate(多→一) | 折疊點 `pairedItem` 取 0 | 收斂到**第一個來源列**(唯一有定義的答案) | ✅ 已定義並測 |
| 引用「不在 primary 脊椎上」的節點(如 `from:[A,B]` 的 B) | 不在 lineage map | 退回舊單跳 fallback | ⚠️ 超出本次範圍,註解寫明 |

### 子表:為什麼跨 aggregate 只能給「第一列」

| 細項 | 說明 |
|---|---|
| aggregate 本質 | N 個 item 折成 1 個(`[{json: [...]}]`),1:1 配對在這一步**物理上消失** |
| 折疊後再問「來自哪一列」 | 沒有單一正解;`lineageOf` 給折疊點 index 0 → 走到 seed 第一列 |
| 為何可接受 | 這是 n8n 同類語意;且**不崩、可預測、有測**,比靜默亂配誠實 |

---

## 第二部 — 狀態架構樹

依賴方向:**render(取值)依賴 run 算好的 lineage;run 不依賴 render**。

```
                  P-LINEAGE 多跳配對  ✅
                          │
        ┌─────────────────┴─────────────────┐
        ▼                                   ▼
   run.ts(算)                          render.ts(用)
   lineageOf(primary, i)                resolveExpr 的 refIdx
        │                                   │
        ▼                                   ▼
   沿 from[0] 脊椎往上走              id === primary ? loop index
   每跳:lineage[node]=idx           : lineage[id]              ← 多跳,優先
        idx = item.pairedItem ?? idx   ?? pairedIndex          ← 單跳,退回(off-spine)
        node = 上一層 primary           ?? loop index           ← 再退回
   直到 trigger(無上游)停
        │                                   │
        ▼                                   ▼
   產出 {祖先id: 來源index} map     傳進 renderPrompt 的第 4、5 欄
   (每個 loop item 各算一份)         pairedIndex(舊·留著)+ lineage(新·optional)

   守則:lineage 是 optional 新欄位 → 不傳也跟以前一樣,
        server.ts(Lane A)完全不用改、不會壞。
```

### 驗收證據(親跑,非斷言)

```
npm test            → 83 passed   (render +3)
npm run e2e:cli     → 42 passed   (真 claude -p 也跑了;舊基準 40 + 我這 2)
npx tsc --noEmit    → 乾淨
```

> **一句話差距**:本次把 `draft.md` 的 P-LINEAGE 從 ❌ 推到 ✅;**唯一剩下的灰區是「非 primary 脊椎」的引用仍走舊單跳**——那不在兩層 fan-out / aggregate 的目標內,已在 `render.ts` 註解標清楚,要做再開下一輪。

---

## 還沒做的事(刻意)

- **沒合併回 `main`**。work.md 合併段要求「rebase main → 跑全套 → 才合」,Lane A 可能在另一個 session 飛;合併順序是你的協調決定。
- **沒碰任何 UI**(Lane B 純引擎),所以 CLAUDE.md 的 Playwright headed 鐵則不適用,驗收走 `npm test` + `e2e:cli`。
- **`draft.md` 還沒回填**:它第 52-57、70、98-99 行把 P-LINEAGE 標成 ❌/未實作;合併回 main 後應更新成 ✅。
