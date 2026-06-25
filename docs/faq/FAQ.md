# chainq 常見問題(FAQ)

> 本文件由使用者提供的截圖與問題逐題彙整而成。每一題包含:問題、截圖情境、回答。
> 鐵律:CLI / flow YAML 才是規格,UI 只是鏡像。以下回答均對照 `src/engine` 程式碼查證。

## 目錄

1. [第一個節點一定要是 input 嗎?](#q1-第一個節點一定要是-input-嗎)
2. [我想讓節點輸出結構化資料,該怎麼做?](#q2-我想讓節點輸出結構化資料該怎麼做)
3. [我想在輸入端設定「多個輸入」,該怎麼設定?](#q3-我想在輸入端設定多個輸入該怎麼設定)
4. [網頁編輯器跟 CLI 指令的邏輯有對應上嗎?](#q4-網頁編輯器跟-cli-指令的邏輯有對應上嗎)
5. [各種節點類型在畫布上怎麼分辨?](#q5-各種節點類型在畫布上怎麼分辨)
6. [我在哪裡設定「輸入欄位」?觸發節點怎麼用?](#q6-我在哪裡設定輸入欄位觸發節點怎麼用)
7. [模型回的是字串,底層怎麼「強制」變成 JSON?](#q7-模型回的是字串底層怎麼強制變成-json)

---

## Q1. 第一個節點一定要是 input 嗎?

**情境**:剛用 `chainq new` 建立新專案,看到第一個節點是 `draft`(ai 型別),面板底部寫著 `no upstream — this is a start node`,不確定是不是該換成 input。

**答**:不用。**任何沒有 `from`(上游)的節點,就是起點節點(start node)**,第一個節點是 `ai` 完全正常。

- 預設模板(`src/cli/new.ts` 的 `NEW_FLOW_TEMPLATE`)就是直接從一個 `ai` 節點 `draft` 開始,沒有 input 節點。
- `input`(`▶ input`)是一種**特殊的 trigger 節點**,它唯一的作用是「宣告執行期參數(params)」並射出種子 item——等同 CLI 的 `--input k=v`。
- 只有當你想**在每次執行時從外部餵值**(例如主題、數量)時,才需要 input 節點。如果你的第一個 prompt 本身就自足(像 `generate 3 food ideas`),根本不需要 input 節點。

> 一句話:`input` 不是「必須的第一個節點」,而是「起點節點的其中一種——專門用來注入執行期數值的那種」。

**📌 更新(預設行為)**:現在**新建的 flow 一律從一個 `start` trigger(input 節點)開始**,並接到第一個節點(`chainq new` 與網頁「Create」共用同一份模板,見 [Q4](#q4-網頁編輯器跟-cli-指令的邏輯有對應上嗎))。這個 `start` 可以完全是空的(no params),它只是讓每條 chain 都有一個明確的起點。
> 注意:這只是**預設模板**。引擎**沒有**強制驗證(舊 flow、沒有 input 節點的 flow 仍然合法可跑);「任何無 `from` 的節點都是起點」這條規則不變。

---

## Q2. 我想讓節點輸出結構化資料,該怎麼做?

**情境**:ai 節點面板左下有一欄 `SCHEMA — STRUCTURED OUTPUT (OPTIONAL, JSON FIELD→TYPE)`,範例是 `{ "text": "string", "n": "number" }`,不確定怎麼用。

**答**:在 ai 節點填那一欄 **schema**。它是一個 `欄位 → 型別` 的最小 JSON 映射。

**支援型別**:`string | number | boolean | array | object`

**行為**(對照 `src/engine/schema.ts`):
1. 模型回的「聊天式」純文字會被自動抽出 JSON(去掉 ` ``` ` 圍欄,並切出最外層的 `{}` 或 `[]`)。
2. 逐欄檢查「有沒有這個欄位 + 型別對不對」。**多餘的欄位允許**;`array`/`object` 只做淺層檢查(只看容器,不看內容)。
3. **不符 → 自動重試一次**(在 prompt 後追加「你上次的答案無效,只回合法 JSON」),再不符才算失敗。
4. 通過後,該節點輸出的 item 會變成**解析後的物件**(不是原始文字),下游就能用 `{{ $json.text }}` 取欄位。

**YAML 範例**:
```yaml
draft:
  type: ai
  prompt: 'generate 3 food ideas, each with a name and spice level 1-5, as JSON'
  schema:
    foods: array
```

**⚠️ 重要陷阱**:`schemaErrors` 要求**最外層必須是 JSON 物件**(不能是裸陣列)。
所以截圖那個 `output only the names` 會回 3 行純文字 —— 想結構化,要做兩件事:
1. **prompt 要求模型輸出指定形狀的 JSON**(光填 schema 不會改變模型怎麼答)。
2. 想輸出清單時,**用物件包起來**,不要直接回陣列:

```yaml
# ✅ 正確:最外層是物件
schema: { foods: array }     # 模型回 { "foods": ["Tacos", "Risotto", "Salmon"] }

# ❌ 會被判錯:最外層是裸陣列
# 模型回 ["Tacos", "Risotto", "Salmon"] → expected a JSON object, got array
```

---

## Q3. 我想在輸入端設定「多個輸入」,該怎麼設定?

**情境**:input 節點面板的 `FROM (FIRST = $JSON)` 只能填一個,想要不只一個輸入。已請我跟 UI/UX 對齊講清楚。

**答**:「多個輸入」在 chainq 裡是**三件不同的事**,先分清楚要哪一種(這也是面板用詞容易混淆的地方):

### A) 一個 input 節點上的多個「參數欄位」(多個表單欄)
在 `input` 節點宣告多個 `params`,每個就是一個執行期欄位(等同 `--input topic=… count=…`):
```yaml
topic_in:
  type: input
  params:
    topic: { type: string, required: true }
    count: { type: number, default: 3 }
```
一組值 → 1 個種子 item;多組值 → 批次(batch)。

> **目前 UI 缺口(誠實標註)**:input 節點面板只**顯示**參數表單,沒有「+ 新增參數」按鈕;要新增參數目前得切到 `{ }` raw 手動編 YAML(面板本身的提示也寫 `Add params in { } raw`)。而且畫布上的 `+ add step` 下拉**目前不含 `input` 選項**(`src/web/app.html` 只列了 ai/cmd/assemble/write)——所以要新增 input 節點,同樣得走 `{ }` raw。引擎是支援 input 的,只是 UI 還沒接上這兩個入口。

### B) 一個節點吃多個「上游」(fan-in / 多重 `from`)
`from` 可以是單一名稱,**也可以是清單**:
```yaml
combine:
  type: assemble
  from: [draftA, draftB]   # 多重上游
  params:
    prompt: "【A】\n{{ $('draftA') }}\n\n【B】\n{{ $('draftB') }}"
```
清單中**第一個是 primary**,綁定 `{{ $json }}`;其他上游用 `{{ $('draftB') }}` 或 `{{ $node["draftB"] }}` 引用。
真正要「合併兩條上游」時用 **assemble**(或 `ai`)節點搭配 `from: [a, b]`,在 prompt 裡把兩邊各自引用進來。UI 上用拖曳連線,或直接改 `from`。

### C) 多筆輸入「值」(批次)
同一個 input 的多組值 → 批次,一組值產生一個 item。透過多組執行期數值或 `--input-file` 餵入。

### UI/UX 用詞對齊(關鍵)
「input」這個詞被重載了,chainq 內部其實分成兩個概念:
| 你想要的「多個輸入」 | 對應機制 | 怎麼設定 |
|---|---|---|
| 多個**參數欄位** | input 節點的 `params` | 加多個 param(目前走 `{ }` raw) |
| 多個**上游來源** | 節點的 `from` 清單 | `from: [a, b]`(用 assemble / ai 節點) |
| 多筆**輸入值** | 批次 items | 多組執行期值 / `--input-file` |

> 一句話:面板裡的 `FROM` 是「上游連線」,不是「輸入欄位」;要多個欄位請加 `params`,要多個來源請用 `from: [...]`。

---

## Q4. 網頁編輯器跟 CLI 指令的邏輯有對應上嗎?

**情境**:在用網頁版編輯 chain,想知道網頁上做的事跟 CLI 指令是不是同一套邏輯。

**答**:**有,而且是刻意「只寫一套」**(本專案鐵律:CLI / flow YAML 才是規格,網頁只是鏡像)。對照程式碼:

| 面向 | 是否共用 | 證據(錨點) |
|---|---|---|
| **建立新 flow 的模板** | ✅ 同一份 | 網頁 `/api/create` 與 CLI `chainq new` 都寫 `NEW_FLOW_TEMPLATE`(`src/cli/new.ts`)。所以新加的 `start` trigger 兩邊長一樣。 |
| **解析 / 驗證 / 執行** | ✅ 同一個引擎 | `src/web/server.ts` 直接 import `parseFlow / validate / Runner`(`../engine`),跟 CLI 是同一份。 |
| **輸入處理**(`--input` vs 網頁參數表單) | ✅ 同一處 | `src/engine/input.ts` 開頭就寫明:coerce + validate 放在**唯一一處**,「網頁表單打的值,coerce/validate 跟命令列 `--input` 完全一致」。 |
| **結構化輸出 schema** | ✅ 同一處 | `src/engine/schema.ts` 的 parse + 驗證 + 重試一次,CLI 跑或網頁跑都走這套。 |

**唯一不對應的部分**:**schema 折疊**這種純呈現的 UI 細節(預設收合、已設則展開)**沒有 CLI 對應**——這是對的。CLI 沒有「面板」,YAML 裡 schema 就只是一個欄位;折疊只是網頁怎麼**呈現**一個選用欄位,不影響資料模型,也不會寫進 YAML。

> 邊界:**資料模型與行為 = 跨介面完全一致(CLI 是規格)**;**純視覺呈現(折疊、版面)= 介面各自負責,本來就不該對應 CLI**。

---

## Q5. 各種節點類型在畫布上怎麼分辨?

**情境**:畫布上節點變多時,想一眼看出哪個是 ai、哪個是 cmd、哪個是起點。

**答**:每種節點類型都有**專屬顏色 + 圖示徽章**(參考 n8n 的做法)。徽章顯示在節點頭部最左邊,是辨識類型的「logo」;同色也用在類型 chip 上。打開節點時,面板頭部也會帶同一個徽章。

| 類型 | 徽章 | 顏色 | 角色 |
|---|---|---|---|
| `input` | ▶ | 🟢 綠 `#10b981` | trigger / 起點(注入執行期參數) |
| `ai` | ✦ | 🟣 紫 `#a78bfa` | 呼叫模型 |
| `cmd` | $ | 🟠 琥珀 `#f59e0b` | 執行 shell 指令 |
| `assemble` | ⊕ | 🔵 藍 `#60a5fa` | 模板組裝 / 合併上游 |
| `write` | ⤓ | 💠 藍綠 `#2dd4bf` | 寫入檔案 |

**設計要點**(誠實標註,避免誤會):
- **徽章顏色 = 類型;左邊框 = 執行狀態**(綠=已跑、灰=快取、紅=失敗、脈動=執行中)。兩者**刻意分開**,不互搶位置——所以類型用「永遠可見」的徽章,不佔用會被狀態用掉的左邊框。
- 顏色定義在 `src/web/ui/app.js` 的 `TYPE_META`(單一來源,canvas 徽章與類型 chip 共用)。要改配色改這一處即可。
- 這是**純前端呈現**,不影響 YAML / 引擎(同 [Q4](#q4-網頁編輯器跟-cli-指令的邏輯有對應上嗎) 的邊界)。

---

## Q6. 我在哪裡設定「輸入欄位」?觸發節點怎麼用?

**情境**:點開第一個 `start` 觸發節點,看到一個 prompt 欄位很困惑;而且找不到哪裡可以設定「要有哪些輸入欄位、預設值是什麼」。

**答**:這塊先前確實不好找,已重新設計。現在點開 `input`(`▶ start`)觸發節點:

1. **不再顯示 prompt 欄位** —— 觸發節點不需要 prompt,整欄會隱藏(它只負責起頭 + 定義輸入)。
2. **「input fields」編輯器**(在面板左欄)就是設定輸入的地方,**不必再去 `{ }` raw**:
   - 點 **`+ add field`** 新增一個欄位
   - 每列可設:**欄位名稱** ｜ **型別**(any / string / number / boolean)｜ **預設值** ｜ **required**(必填)｜ **×**(刪除)
   - 按 **Save** 寫回 flow YAML 的 `params`
3. 每個欄位會以 **`{{ $json.欄位名 }}`** 流到下游節點。例如預設模板的 `start` 定義了 `topic`,`draft` 的 prompt 就寫 `Write one sentence about {{ $json.topic }}.`。

**兩種「輸入」別搞混**(面板上下兩塊):
| 區塊 | 作用 | 存到哪 |
|---|---|---|
| **input fields**(上,定義) | 宣告有哪些欄位、型別、預設、必填 | 存進 flow 的 `params`(`Save` 後寫檔) |
| **test values for ▷ Run**(下,執行值) | 這次跑要餵的實際值(等同 CLI `--input`) | **不存檔**,只隨這次執行送出 |

> 預設模板現在就附一個示範 `topic` 欄位,讓新手一眼看懂「觸發節點定義欄位 → 下游用 `{{ $json.topic }}` 取用」。空的觸發節點也合法(只是單純起頭整條 chain)。
> 對應錨點:`src/web/ui/app.js` 的 `renderParamsEditor` / `collectParams`;預設模板 `src/cli/new.ts` 的 `NEW_FLOW_TEMPLATE`。

---

## Q7. 模型回的是字串,底層怎麼「強制」變成 JSON?

**情境**:ai 節點面板選了 `JSON` 格式、填了 `headline: string`,prompt 也寫「只回傳 `{"headline": "…"}`」。想知道引擎底層到底對模型那串文字做了什麼,才讓下游能用 `{{ $json.headline }}`。([Q2](#q2-我想讓節點輸出結構化資料該怎麼做) 講「怎麼用」,這題講「底層怎麼跑」。)

**答**:**模型回的永遠是純文字字串**。`schema` 不是叫模型改用 JSON 模式,而是引擎在拿到字串後,套一道 **extract → validate → 重試一次 → 失敗** 的閘門,把字串「強制」解析+驗證成結構化物件。沒有 `schema` 就原文字串原封不動往下流。

**完整資料流**(對照 `src/engine/run.ts:346-369`):

```
   rendered prompt ─(STDIN)→ proc.ts runSubprocess(claude -p / codex)
                                      │
                                      ▼  res.stdout = 字串(一律)
                         ┌─ node.schema 存在? ─┐
                      NO │                      │ YES
                         ▼                      ▼
                {json: stdout}          extractJson()  ← 去 ``` 圍欄 + parse + 切最外層 {…}/[…]
                字串原封不動                    │ parsed
                                               ▼
                                        schemaErrors()  ← 頂層須 object + 逐欄位型別(淺檢查)
                                        errs=[] │ │ errs≠[]
                                                ▼ ▼
                                  {json: parsed}   retry once → 仍錯則 fail
                                  pairedItem: i
```

**三個關鍵函式**(全在 `src/engine/schema.ts`):

| 函式 | 行 | 做什麼 | 容錯 / 邊界 |
|---|---|---|---|
| `extractJson` | `9-21` | 去掉 ` ```json ` 圍欄 → `JSON.parse` → 失敗就切出最外層 `{}`/`[]` 再 parse | ✅ 容忍圍欄、JSON 前後散文;❌ 不救 JSON 內部壞引號 / 多個獨立物件 |
| `schemaErrors` | `29-45` | 頂層必須是 object,逐欄位查「存在 + 型別」 | 多餘欄位允許;`array`/`object` 只看容器(淺);`number` 用 `Number.isFinite`(NaN/Infinity 算錯) |
| `correctionNote` | `48-54` | 重試時追加的糾正句:「上次無效,只回合法 JSON,不要散文不要圍欄」 | — |

**重試規則(最多兩次模型呼叫,不迴圈)**:第一次 parse 失敗或驗證不符 → 帶 `correctionNote` 重跑一次 → 第二次仍錯就 `fail("schema mismatch after retry: …")`(`run.ts:367`),不會無限重試。

**⚠️ 最常踩的點:引擎不會自動 wrap 純文字**。即使 schema 只有一個 `headline: string` 欄位,模型還是**必須**回 `{"headline":"…"}` 這個物件;它若只回一句純標題,`extractJson` 會 throw `no JSON found` → 觸發那次糾正重試。這就是為什麼 prompt 一定要明寫「只回傳 `{"headline": "你的標題"}`」——**光填 schema 不會改變模型怎麼答**(同 [Q2](#q2-我想讓節點輸出結構化資料該怎麼做) 的陷阱)。唯一會自動 wrap 的是 UI 的 **List** 格式(存成 `{_list: array}`),裸陣列不能當頂層才需要它。

> 一句話:`schema` = 拿到字串後的「解析+驗證閘門」,不是模型端的輸出模式;成功才把 item 從字串換成解析後的物件,下游 `{{ $json.欄位 }}` 才取得到。
