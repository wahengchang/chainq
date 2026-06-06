# 建立 `aggregate` 節點(多筆併成一筆 / fan-in)

`aggregate` 是集合運算:把上游**所有** items 收成**一筆**輸出,內容是一個陣列。
是 `splitOut` 的相反。對應 n8n 的「Aggregate」。常用來把 fan-out 的結果收回一條再交給下游。

| 欄位 | 必填 | 說明 |
|---|---|---|
| `from` | ✅ | **恰 1 個**上游 |
| `field` | ⬜ | 從每筆取出的屬性名;省略 → 收整個 item 值 |

starter 預設:`{ type: aggregate }`(需自己接 1 個上游)

行為(`src/engine/run.ts`):把上游每筆的 `field`(或整個值)收集成陣列,輸出**單一** item
`{ json: [...] }`(上游空 → `[]`)。

## CLI

把上游每筆的 `name` 欄位收成一個陣列:

```yaml
  names:
    type: aggregate
    from: people
    field: name            # → 一筆,值是 [name1, name2, ...]
```

收整個值(不指定欄位):

```yaml
  all:
    type: aggregate
    from: people           # → 一筆,值是 [item1, item2, ...]
```

## URL

```bash
# 1) 建節點
curl -s http://127.0.0.1:<PORT>/api/add-node \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","id":"names","type":"aggregate"}'

# 2) 接 1 個上游
curl -s http://127.0.0.1:<PORT>/api/connect \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"names","from":["people"]}'

# 3)(選用)設要收的 field
curl -s http://127.0.0.1:<PORT>/api/set \
  -H 'content-type: application/json' \
  -d '{"path":"<FLOW>","node":"names","field":"field","value":"name"}'
```

## 常見錯誤

- `aggregate needs exactly 1 input, got N` — 必須恰好 1 個上游。

## 相關

- 拆出去:[create-splitout.md](create-splitout.md)
- 合併兩條(非收合一條):[create-merge.md](create-merge.md)
- 總覽:[create.md](create.md) · 索引:[README.md](README.md)
