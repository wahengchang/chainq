# 網頁證據目錄

此目錄保存 Spike／實作中「真的在 GitHub、Pages 或本機 production preview 看到」的關鍵步驟，不放示意圖或假畫面。

## 已保存證據

| 檔案 | 證明內容 |
|---|---|
| `phase1-01-home-source-and-last-updated.png` | 本機 production preview 的首頁、真實來源 SHA、圖片、sidebar 與 `Last updated: Jun 30, 2026`。 |
| `phase1-02-cli-reference-distinct-last-updated.png` | CLI reference 顯示另一個真實日期 `Jun 25, 2026`，證明不是統一 build time。 |

GitHub Pages 設定頁的 Chrome session 沒有登入 GitHub，因此沒有偽造設定頁截圖，也沒有觸碰帳密；等價設定已透過既有登入的 GitHub CLI/API 完成，原始狀態另存於上一層 `evidence/github-pages-setting.json`。

## 命名方式

```text
<phase>-<sequence>-<subject>-<state>.png
```

例如：

```text
phase1-01-pages-source-github-actions.png
phase1-02-actions-deploy-success.png
phase1-03-site-last-updated-two-pages.png
phase1-04-build-failed-old-site-still-live.png
phase2-01-source-dispatch-run.png
phase3-01-generated-page-source-metadata.png
```

## 每張圖必須能回答

1. 哪個 repository／branch／commit？
2. 哪個 GitHub Actions run 或哪個 Pages URL？
3. 它證明哪一條驗收標準？
4. 畫面時間與檔名是否可對回 `project.md` 的工作 ID？
5. 是否避免拍到 PAT、secret value、cookie 或其他敏感資訊？

## 必拍清單

- GitHub Pages source 設為 GitHub Actions。
- Phase 1 deploy workflow 成功與公開網站首頁。
- 兩個不同 Git commit 時間的頁面顯示不同 `lastUpdated`。
- 故意 build failure 後，舊版網站仍在線。
- Phase 2 source repo dispatch 與中央 workflow payload/run。
- Phase 3 generated page 的來源 repo/path/SHA/time。
- 圖片與相對連結在 project-site base path 下正常。
- manifest 移除項目後，orphan page 不再存在。
