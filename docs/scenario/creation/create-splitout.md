# 建立 `splitOut` 節點(一筆拆多筆 / fan-out)

`splitOut` 是集合運算:把上游**每一筆**裡的**陣列**拆開,陣列每個元素變成一筆獨立的
輸出 item。下游就會對每個元素各跑一次(fan-out)。對應 n8n 的「Split Out」。

| 欄位 | 必填 | 說明 |
|---|---|---|
| `from` | ✅ | **恰 1 個**上游 |
| `field` | ⬜ | 要拆的屬性名(item 是物件時);省略 → 直接把 item 的值當陣列拆 |

starter 預設:`{ type: splitOut }`(需自己接 1 個上游)

行為(`src/engine/run.ts`):每筆輸入 → 取 `field`(或整個值)→ 必須是陣列 → 陣列每個
元素 push 成一筆輸出,並記住來源(`pairedItem`)。

## CLI

上游輸出形如 `{ "cities": ["Tokyo","Osaka","Kyoto"] }` 時:

```yaml
  cities:
    type: splitOut
    from: source
    field: cities          # 把 source 每筆的 cities 陣列拆成多筆
```

若上游每筆本身就是一個陣列(不是物件),省略 `field`:

```yaml
  items:
    type: splitOut
    from: source           # 不寫 field → 整個值當陣列拆
```

拆完後下游(如 ai)會對每個元素各跑一次。

## URL

```bash
# 1) 建節點
curl -s http://127.0.0.1:<PORT>/api/add-node \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","id":"cities","type":"splitOut"}'

# 2) 接 1 個上游
curl -s http://127.0.0.1:<PORT>/api/connect \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"cities","from":["source"]}'

# 3)(選用)設要拆的 field
curl -s http://127.0.0.1:<PORT>/api/set \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"cities","field":"field","value":"cities"}'
```

## 常見錯誤

- `splitOut needs exactly 1 input, got N` — 必須恰好 1 個上游(0 或 2+ 都不行)。
- 執行期 `splitOut: item i field "X" is not an array` — 取到的不是陣列。確認上游輸出的
  該欄位真的是 JSON 陣列(`ai` 節點輸出是**生文字**、不會自動 parse;通常先用一個會吐
  JSON 的步驟,或讓 prompt 明確輸出 JSON 陣列)。

## 相關

- 收回來:[create-aggregate.md](create-aggregate.md)(多筆併回一筆)
- 總覽:[create.md](create.md) · 索引:[README.md](README.md)
