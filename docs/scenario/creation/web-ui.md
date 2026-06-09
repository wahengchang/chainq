# 用 web UI(瀏覽器)建立

前面各篇的「URL」段給的是 `curl` 打 API。這篇是**真正在瀏覽器介面裡點按操作**的走法 ——
不必記端點,看畫面做即可。背後打的還是同一組 `/api/*`,改的還是同一份 `flow.yaml`。

對應程式碼:畫面 `src/web/app.html`、互動 `src/web/ui/app.js`、後端 `src/web/server.ts`。

## 0. 開介面

```bash
chainq ui                 # 開「建立」畫面
chainq ui flow.yaml       # 直接開某份 flow 的編輯器
```

macOS 會自動開預設瀏覽器;否則複製它印出的網址(`http://127.0.0.1:<PORT>/`)貼到瀏覽器。

---

## 1. 建立專案 / 工作流(Create 畫面)

開介面後第一個畫面是 **Start a chain**:

1. **Target folder** 填專案資料夾路徑(例:`/abs/path/proj`)。按 **List** 可列出該資料夾
   已有的 flow,點任一個就直接開編輯器。
2. **New flow name** 填新 flow 名稱(例:`my-flow`,不必加 `.yaml`)。
3. 按 **Create →**(或在名稱欄按 Enter)。

建好後自動進編輯器。新檔用的是 draft → refine 的起始範本。

> 注意:web 的 Create 會**建資料夾 + 一份 flow**,但不像 CLI `chainq init` 會額外產
> `.gitignore` / `input.txt`。要完整 scaffold 用 CLI,見 [create.md](create.md)。

---

## 2. 編輯器畫面導覽

進編輯器後:

- 頂列:**← projects** 回上一頁、檔案路徑、**{ } raw** 切換原始 YAML、
  profile 膠囊 **● claude -p · real**(每次執行都呼叫真實本機模型)、
  **▷ Run all** 跑整條、**↻ fresh** 忽略 cache 全跑。
- 中間是**節點畫布**:每個節點一張卡片,滑鼠移上去會出現右緣的接線圓點與單節點執行鈕。
- 畫布下方一排:**型別下拉** + **+ add step**。

---

## 3. 新增一個節點

1. 在下拉選型別:**✦ ai · $ cmd · ⊕ assemble · ⤙ split out · ⤚ aggregate · ⋈ merge · ⤓ write**。
2. 按 **+ add step**。系統會自動命名 `step1`、`step2`…並**立刻打開該節點的面板**。

> ⚠️ 下拉**沒有 `input` 型別**。要建 `input`(觸發點 / 執行期欄位)目前只能用頂列的
> **{ } raw** 直接寫 YAML(見第 6 節)。原因:`input` 不接上游、靠 `params` 設定,
> 不適合畫布上的「加一個接線節點」流程。

---

## 4. 編輯節點(面板)

點任一節點打開面板,分三欄:**input | prompt | output**,頂部有改名與執行/存檔鈕。

- **改名**:點最上方的 id 欄,改完按 Enter(或點開)。引擎會同步改掉所有下游的 `from`
  和 prompt 裡的 `$('id')` 參照,cache 也跟著搬,不會斷。
- **接上游(from)**:input 欄上方顯示目前接進來的上游,每個是一顆 **chip**(第一個標
  `$json`,是主輸入),點 chip 上的 **×** 斷線。**加**上游用第 5 節的拖拉接線(或一條線上
  的 **+** 在兩節點間插一步)。這裡不再用打字填 `from`。
- **型別專屬欄位**(input 欄中段,依型別自動切換):

  | 型別 | 面板顯示的欄位 |
  |---|---|
  | `cmd` | **mode** — `once`(整批跑一次)/ `perItem`(每筆跑一次) |
  | `splitOut` / `aggregate` | **field** — 要拆出 / 收集的屬性(留空 = 整筆) |
  | `merge` | **mode**(append / byPosition / byKey)+ **key**(byKey 時 join 的屬性) |
  | `write` | **path**(輸出檔,支援 `{{date}}` / `{{datetime}}`)+ **mode**(overwrite / append) |
  | `input` | **input fields** — 宣告執行期欄位(name / type / default / required) |

  > `ai` 的 **schema** 不在這裡 —— 它描述的是**輸出**形狀,所以放在 **output 欄**上方(見下)。

- **prompt**:中欄是 prompt 範本(`ai` / `assemble` 用);下方 **fx rendered** 會在你
  ▷ Run to here 之後,顯示 `{{ }}` 代入真實上游資料後的樣子(沒跑過則維持字面)。
- **不存檔就能跑(草稿)**:改了欄位**不必先按 Save**。你的編輯會被當成這個節點的
  **草稿**留著 —— ▷ Run / ↻ re-run **跑的就是草稿**(後端在記憶體套用,`flow.yaml`
  不動),切到別的節點、關掉面板都**不會丟**,回來編輯還在。畫布上有草稿的節點會標一顆
  **●**,面板左下也有「未儲存」提示。
  - 按 **Save** 把草稿寫進 `flow.yaml`(正式生效)。
  - 按 **↩ 重設** 丟掉這個節點的草稿,還原成存檔值。
  - 草稿只活在瀏覽器、這份 flow、這個工作階段;關掉整個分頁才會清掉。

### ai 的 schema(原生結構化輸出)

schema 描述的是節點**輸出**的形狀,所以編輯器放在 **output 欄**最上方(實際輸出的上面)。
它是兩段式 —— 先選**輸出格式**,只有 JSON 會展開欄位:

| 格式 | 意思 |
|---|---|
| **Text** | 生文字、不驗證(最常見,預設) |
| **JSON** | 原生物件輸出 —— 一列一個 **`欄位 → 型別`**,下方即時預覽「模型該回什麼」 |
| **List** | 一個清單。引擎不允許頂層是裸陣列,所以系統把它包進保留欄位 **`_list`**,下游讀 `{{ $json._list }}`(純 UI 包裝,引擎零改動) |

JSON 模式下,每列填欄位名 + 選型別(`string` / `number` / `boolean` / `array` / `object`;
`array`/`object` 只淺檢查容器),按 **+ add field** 加列。設了之後,該節點輸出會被
**當 JSON 解析並驗證**:對不上自動帶更正提示**重試一次**,再不行就 fail;成功時輸出 item
就是**解析後的物件**。切換格式**不會清掉**已建的 JSON 欄位(誤點不會弄丟)。

---

## 5. 拖拉接線

不想打字接線就用拖拉:

1. 滑鼠移到「來源」節點,右緣會出現一顆**圓點(port)**。
2. 按住圓點拖到「目標」節點上放開 → 自動寫進目標的 `from`(順序保留,壞掉會被擋下不落地)。

拖拉節點本體可移動位置;一旦手動移動,畫布改用絕對座標並存進 `.chain/layout/`(只影響排版,
不寫進 flow YAML)。

---

## 6. 直接編 YAML({ } raw)

頂列 **{ } raw** 切到整份 YAML 的編輯框,改完按 **Save raw YAML**。存檔前會先驗證,
**壞的不落地**。要建 `input` 節點、或一次大改,用這個最快:

```yaml
steps:
  topic:
    type: input
    params:
      subject: { type: string, required: true }
```

---

## 7. 執行 / 看結果

- 單一節點:面板的 **▷ Run to here**(跑它和它的上游;吃 cache)、**↻ re-run**(忽略 cache 重跑它)。
- 整條:頂列 **▷ Run all** / **↻ fresh**。
- **跑的是你眼前的版本**:有未存草稿時,執行跑的就是草稿(後端記憶體套用,`flow.yaml` 不動)。
  想看結果不必先 Save;滿意了再 Save、不要就 ↩ 重設。
- 執行**逐一進行**(NDJSON 串流):同一時間只有**一個**節點在跑(實心 + 轉圈),其餘是
  **排隊中**(虛線、不轉圈),跑完即翻成完成色。面板 output 欄顯示輸出,可看每筆 item;
  節點排隊/執行時不會顯示上一次的舊輸出。
- `input` 節點宣告的 `params` 會在畫面上變成輸入框,執行時一起送出(等同 CLI `--input`,
  **不存進 flow**)。

---

## UI 操作 ↔ API 對照(背後打什麼)

| UI 動作 | 端點 |
|---|---|
| Create → | `POST /api/create` |
| + add step | `POST /api/add-node`(自動 id `stepN`) |
| Save(面板) | `POST /api/set`(逐欄寫該節點自己的欄位) |
| ↩ 重設 | 純前端 —— 丟掉草稿、用存檔值重畫,不打 API |
| 拖拉接線 / 斷線 | `POST /api/connect` |
| 改名 | `POST /api/rename` |
| Save raw YAML | `POST /api/save`(先驗證) |
| ▷ Run all / Run to here | `POST /api/run` / `POST /api/run-node`(NDJSON 串流;未存草稿用 `overrides` 隨請求帶上,記憶體套用) |
| delete | `POST /api/delete-node`(下游還在用會被擋) |

## 相關

- 端點細節與 curl 版:[create.md](create.md) 及各型別 `create-*.md`
- 場景總索引:[../README.md](../README.md)
