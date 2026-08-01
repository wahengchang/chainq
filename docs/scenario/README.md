# 場景式操作教學

已經知道要完成什麼工作時,從這裡選一條最短路徑。若尚未安裝或還沒成功跑過
第一條 chain,請先完成 [Getting started](../getting-started.md)。

## 用哪種方式操作?

| 目標 | 從這裡開始 |
|---|---|
| 在瀏覽器畫布建立、接線並執行 flow | [用 web UI 建立](creation/web-ui.md) |
| 建立專案、flow、節點、連線或輸入欄位 | [建立各種東西](creation/create.md) |
| 只查某一種節點怎麼寫 | [節點型別索引](creation/README.md) |
| 查 CLI flag 或完整 YAML 契約 | [CLI reference](../cli/reference.md) |
| 解決 input、schema 或 UI 常見疑問 | [FAQ](../faq/FAQ.md) |

## 五種節點

chainq 的 flow 只使用五種節點。每個連結都包含最小 YAML、操作方式、常見錯誤
與相關文件。

- [`input`](creation/create-input.md):宣告執行期輸入欄位並啟動 flow。
- [`ai`](creation/create-ai.md):呼叫本機 CLI 模型。
- [`cmd`](creation/create-cmd.md):執行不經 shell 的本機命令。
- [`assemble`](creation/create-assemble.md):不呼叫模型,只組裝或合併資料。
- [`write`](creation/create-write.md):把上游結果寫入檔案。

CLI、web UI 與 URL API 都會修改同一份 `flow.yaml`,並共用同一個引擎。
選擇最方便的介面即可,不需要在介面之間匯入或匯出。
