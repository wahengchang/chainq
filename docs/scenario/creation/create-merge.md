# 建立 `merge` 節點(合併兩條上游)

`merge` 是集合運算:把**恰兩條**上游 items 流依策略合併成一條。對應 n8n 的「Merge」。

| 欄位 | 必填 | 說明 |
|---|---|---|
| `from` | ✅ | **恰 2 個**上游:`from: [a, b]` |
| `mode` | ⬜ | `append`(預設)·`byPosition`·`byKey` |
| `key` | 視情況 | `mode: byKey` 時**必填**:兩邊用哪個屬性 join |

starter 預設:`{ type: merge, mode: "append" }`(需自己接 2 個上游)

### 三種 mode(`src/engine/run.ts` 的 `mergeItems`)

- `append` — 把 a 的 items 接上 b 的 items(直接串接)。
- `byPosition` — 依索引配對(a 第 i 筆配 b 第 i 筆)。
- `byKey` — 兩邊用 `key` 指定的屬性值 join。

## CLI

```yaml
  combined:
    type: merge
    from: [listA, listB]   # 恰 2 個上游
    mode: append
```

byKey 範例(兩邊用 `id` 對齊):

```yaml
  joined:
    type: merge
    from: [users, orders]
    mode: byKey
    key: id
```

## URL

```bash
# 1) 建節點(starter 已含 mode: append)
curl -s http://127.0.0.1:<PORT>/api/add-node \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","id":"combined","type":"merge"}'

# 2) 接「恰 2 個」上游(順序有意義)
curl -s http://127.0.0.1:<PORT>/api/connect \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"combined","from":["listA","listB"]}'

# 3)(選用)改 mode;若用 byKey 還要設 key
curl -s http://127.0.0.1:<PORT>/api/set \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"combined","field":"mode","value":"byKey"}'
curl -s http://127.0.0.1:<PORT>/api/set \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"combined","field":"key","value":"id"}'
```

## 常見錯誤(validate 會擋)

- `merge needs exactly 2 inputs (from: [a, b]), got N` — 必須恰 2 個上游。
- `merge mode byKey needs a 'key' field` — 用 `byKey` 卻沒設 `key`。

## merge vs assemble

要**結構化**合併兩條資料流(append/byPosition/byKey)用 `merge`;要用**範本貼字串**、
或合併超過兩條,用 [`assemble`](create-assemble.md)。

## 相關

- 範例:`examples/fan-in-merge.yaml`(用 assemble 版的合流對照)
- 總覽:[create.md](create.md) · 索引:[README.md](README.md)
