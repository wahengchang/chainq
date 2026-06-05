# idea.md 願景 vs 現況 — 能力與缺口圖

> 格式沿用 `draft.md`(能力與缺口圖):**統一圖例 + 第一部盤點(依 idea.md 的 Epic A–G)+ 第二部狀態樹**。
> **以 code 為準**(三個探子逐檔核實,帶 file:line);`idea.md` 是願景,本檔標出「願景說了、code 證實做了沒」。
> 統一圖例:✅ 已完成 · 🟡 半建(部分/只差接線)· ❌ 未建 · ⛔ 刻意不做(寫理由)· ⚠️ 風險/邊界。
> **一句話差距**:**引擎核心、CLI、快取/失效、迭代(--pin/from/to/steps)、接續、運算式第一層**——全部到位。**願景缺口集中在三個整塊沒建的 epic:① D 成品 `write` 節點(連一句話定義的「存好」都靠它)· ② C2/C3 迴圈容器 Loop · ③ C4 schema 結構化輸出**;其餘是小缺(E4 指令存在性預檢、`--quiet`、運算式第二層沙箱)與 UI「後端已備、只差接線」(逐項/拖拉/型別編輯器)。

---

# 第一部 — 模組盤點（依 idea.md Epic A–G）

| Epic | 子項 | 現況 | 錨點(file:line) | 完成度 |
|---|---|---|---|---|
| **A 拆流程並跑** | A1 具名 steps + `from` · A2 `chain run`+log · A3 `from`/`$json` · A4 `{{}}` + E4 擋未宣告 | 全部可用;log 前綴見 E1 | `cli/index.ts`·`dag.ts`·`render.ts`·`validate.ts` | ✅ |
| **B 快速迭代** | B1 `--pin` 樣本→scratch · B2 hash 失效只重跑下游 · B3 `--profile` 換模型 | 全部可用 | `cli/index.ts:96`·`cache.ts:74`·`plan.ts:32` | ✅ |
| **C 進階編排** | C1 assemble · cmd · **C2/C3 迴圈容器** · **C4 schema+重試** | assemble/cmd ✅;**Loop 與 schema 整塊沒建**(↓子表) | `node.ts`(型別只到 merge/input)·`types.ts:15` | 🟡 一半 |
| **D 產出彙整** | D1 `write` overwrite · D2 `write` append + `{{date}}` + 同日去重 | **整個 Epic 沒建**;`NodeType` 沒有 `write`(↓子表) | `types.ts:15`(無 write) | ❌ |
| **E 排錯接續** | E1 log 前綴+脈絡 · E2 暫存保留 · E3 沿用/`--from`/`--to`/`--steps` · E4 跑前驗證+「你是不是要打 X」 | E2/E3 ✅;E1 前綴 🟡(無 `▶ 開始`);E4 靜態檢查 ✅ 但**缺指令存在性 `which` 預檢** | `run.ts:144`·`cli/index.ts:224`·`validate.ts:96`(editDistance 猜名 ✅) | 🟡 大致齊 |
| **F 視覺化編輯** | F1 看每步全貌 · F2 就地改試跑 · F3 逐站推進 · F4 結構編輯 | F1 檢視✅·input✅(逐項面板待 P1-b)· F3 逐站✅ · F4 add/connect/rename/delete✅(拖拉/型別編輯器待 P2) | `app.js`·`server.ts`(17 API) | 🟡 後端齊／UI 待接 |
| **G 可攜與信任** | G1 少而精相依 · G2 profile 換假模型自測 · G3 log 誠實前綴 | G1/G2 ✅(cmd 子行程 → echo/cat fixture 即離線);G3 🟡(✓⊘✗ 有、`▶ 開始`/`--quiet` 缺) | `proc.ts`·`profiles.ts`·`cli/index.ts:30` | 🟡 |

> 凡 ❌/🟡 開子表拆細項 ↓

### 子表:三個整塊沒建的願景 epic（願景核心缺口）

| 缺口 | idea.md 出處 | code 現況(證據) | 完成度 |
|---|---|---|---|
| **D `write` 成品節點** | §0 一句話定義「跑完自動把每步結果存好」· §8.3 | `NodeType` 只有 `ai\|cmd\|assemble\|splitOut\|aggregate\|merge\|input`(`types.ts:15`),**無 `write`**;輸出只進 `.chain/outputs`(內部快取),**沒有使用者要的成品檔**(overwrite/append/`{{date}}`/同日去重) | ❌ |
| **C2/C3 迴圈容器 Loop** | §4.3 | `types.ts` 無 `over`/`as`;`node.ts` 無 loop 型別。專案改用 splitOut/aggregate 的 **items 模型**代替逐筆容器,但 idea.md 的「容器內含子流程、逐筆接力、`continueOnFail`」沒建 | ❌ |
| **C4 schema + 回灌重試** | §4.4 例·§8.2 | `FlowNode` 無 `schema` 欄位;ai 步沒有「抽 JSON→比對→不符回灌重試 1 次→仍不符 FAILED」 | ❌ |

### 子表:小缺口 / 邊界（願景寫了、code 未到位）

| 細項 | idea.md | code 現況 | 完成度 |
|---|---|---|---|
| 運算式第二層沙箱 `{{ a+b }}`/`.toUpperCase()` | §4.2 第二層 | `render.ts:1-3` 明寫「tier-2 JS 沙箱因安全面**延後**」;無 eval/Function,非第一層樣式一律原文帶回(`render.ts:60`) | ⛔ 刻意延後(安全) |
| E4 指令存在性 `which` 預檢 | §5⑤·§8.4 | **沒建**:`proc.ts:69` 註解說「上游 which 預檢」但無此 code;只有跑時 ENOENT。`validate.ts` 只驗 profile 名(:35),不驗 binary 在不在 | ❌ |
| `--quiet` 關串流 | §9 | **沒建**:`parseFlags` 無 `--quiet`(全 src 零命中) | ❌ |
| log `▶ 開始` 前綴 | §9 | 只有 ✓ran/⊘cached/✗failed/–skipped(`cli/index.ts:30`),無「開始」事件 | 🟡 |
| `.chain/samples/` 樣本慣例 | §8.1 | `--pin` 讀**任意路徑**(`cli/index.ts:102`),不強制/不建 `.chain/samples/` | ⚠️ 慣例未落地 |
| `state.json` 存「狀態」 | §7 | 只存 `{key,outputFile}`(`cache.ts:108`);狀態由 cache 命中推斷,非顯式記錄 | 🟡 夠用 |

### 子表:已建但未接線 / 已知邊界（draft.md 也標過）

| 細項 | 現況 | 錨點 | 完成度 |
|---|---|---|---|
| FlowLock 跨 process | 已建、**CLI 已接**(`cli/index.ts:191` acquire/release);**web server 未接**(in-process Promise mutex 代替) | `lock.ts` · `server.ts:430` 註解自陳 | 🟡 CLI✅／web 未接 |
| paired-item 多跳 lineage | ✅ 已完成(跨兩層 fan-out、跨 aggregate 收斂第一列);「非 primary 脊椎」引用仍走單跳 fallback | `render.ts:133` · `run.ts` lineage | ✅(邊界已知) |
| input 在 web | ✅ 已完成(本線):typed 參數 + required,CLI/web 共用契約 | `input.ts` · `server.ts` · `app.js` | ✅ |

---

# 第二部 — 狀態架構樹（願景三大塊 vs 現況）

依賴方向:**②CLI 與 ③網頁 都建在 ①引擎 之上,永不寫兩套**(idea.md §2 鐵則,code 確實如此)。

### ① 引擎 src/engine — 願景骨架大半已立，缺三個節點能力

```
              ① 核心引擎 src/engine   唯一真相
                         │
   ┌──────────┬──────────┼───────────┬────────────┬──────────────┐
   ▼          ▼          ▼           ▼            ▼              ▼
 資料模型   執行引擎    快取/狀態    驗證         運算式         節點型別
 types·dag  run·proc   cache·state  validate     render         node
 ✅         ✅ stdin·   ✅ Merkle·   ✅ 接線/環/   第一層 ✅      ai·cmd·
            argv·      hash 失效·   引用/profile  (.field·[n]·   assemble·
            timeout    DAG 連動·    ·猜名         [-1]·[*]·      split·agg·
            120s·      --from/to/   ⚠️ 無 which   $node·$('id')  merge·input ✅
            stderr·    steps·pin    預檢          ·多跳 lineage)
            auth偵測   /scratch·                  第二層沙箱 ⛔    ❌ write
                       --fresh                    (延後)         ❌ loop 容器
            ⚠️ FlowLock 已建·CLI接·web未接                       ❌ schema(C4)
```

### ② CLI src/cli — 指令面幾乎全到位

```
        ② CLI ──► run / validate / ui / ls / init / new   ✅
                    │  --fresh·--from·--to·--steps·--pin·--profile·--input(-file) ✅
                    ▼
              log 串流 ✓ran ⊘cached ✗failed –skipped  🟡(無 ▶開始 · 無 --quiet)
              測試:e2eCli 15檔·42測 ✅
```

### ③ 網頁 src/web — F1 檢視+input 已通，F2/F4 後端齊只差接線

```
        ③ 網頁 src/web
              │
      ┌───────┴──────────────┐
      ▼                      ▼
   server.ts ✅          編輯器 ui/app.js
   17 API + input 契約    F1 檢視 ✅ · input 參數 ✅(本線)
                          F3 逐站推進 ✅(runTo/runNode)
                          F2 改試跑 🟡(ai render 預覽✅;web 無 --pin/scratch UI)
                          F4 結構編輯 🟡(add/connect/rename/delete✅;
                             逐項面板❌待P1-b·拖拉連線❌待P2-b·型別編輯器❌待P2-a)
        測試:server.test×4 · browser e2e(editor+input headed)✅
```

---

> **願景完成度速記**:Epic A ✅ · B ✅ · C 🟡(assemble/cmd ✅,loop/schema ❌)· **D ❌** · E 🟡(缺 which 預檢/`--quiet`)· F 🟡(後端齊待接線)· G 🟡(log 前綴未滿)。
> **若要照 idea.md 補齊,缺口排序**:① **D `write` 成品節點**(一句話定義就靠它,且是新節點型別、可離線測)→ ② **C4 schema+重試**(ai 步可靠性)→ ③ **C2/C3 迴圈容器**(最大、最 research-y)→ 其餘小缺(E4 `which` 預檢、`--quiet`、FlowLock 接 web)。
> **若要先把已建的價值交付到使用者眼前**:走 draft.md 的 **P1-b 逐項面板 → P2 拖拉/型別編輯器**(後端全齊,純前端接線)。
