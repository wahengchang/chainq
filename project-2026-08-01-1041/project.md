# 自動文件網站：專案立項盤點

> 建立時間：2026-08-01 10:41（Asia/Taipei）
>
> 階段：Phase 1 本機閉環完成；等待分支進入 `main` 後首次 Pages 部署
>
> 來源專案：`wahengchang/chainq`（本機 branch：`main`，HEAD：`7616818`）
>
> 需求來源：`/Users/pp/Downloads/automatic-docs-site-handover.md`
>
> 本階段產物：本文件、`config-map.yaml`、`evidence/screenshots/`

## 已確認決策（2026-08-01）

| 決策 | 結論 |
|---|---|
| Repository 拓撲 | 使用既有 `wahengchang/chainq`，不建立新 repository。 |
| 網站位置 | 同 repo 的 `docs-site/`，與根目錄 CLI package 隔離。 |
| Worktree | `/Users/pp/Desktop/projects/chainq-worktrees/docs-site-bootstrap`，branch `codex/docs-site-bootstrap`。 |
| Pages URL | GitHub project site：`https://wahengchang.github.io/chainq/`。 |
| 文件所有權 | 根目錄 `README.md`、`CHANGELOG.md`、`docs/` 是 canonical；`docs-site/src/content/docs/` 由 build-time sync 生成，不人工維護。 |
| 第一階段範圍 | 先完成 Phase 1：同 repo 自動同步、Starlight build、Pages workflow、真實日期與瀏覽器驗收。 |

## Phase 1 實作結果（2026-08-01 13:01）

| 項目 | 狀態 | 可檢查證據 |
|---|---|---|
| 同 repo 文件網站 | ✅ | `docs-site/`；canonical 文件仍是根目錄 `README.md`、`CHANGELOG.md`、`docs/`。 |
| 明確公開 allowlist | ✅ | `docs-site/sync-manifest.yml` 共 18 頁；工程內部文件不會因 glob 被公開。 |
| 同步、來源追蹤與資產處理 | ✅ | `scripts/sync-docs.mjs` 注入逐檔 Git 日期、來源 path/SHA，重寫連結並複製圖片。 |
| 生成內容驗證 | ✅ | 5 個 Vitest 測試通過；生成 18 頁並驗證 frontmatter、來源、route、URL 與 build-info。 |
| Astro/Starlight production build | ✅ | Astro check：0 errors／0 warnings／0 hints；production build：19 pages。 |
| 真實瀏覽器驗收 | ✅ | Playwright headless 與 headed + `SLOWMO=850` 各通過；兩張畫面在 `evidence/screenshots/`。 |
| GitHub Pages source | ✅ | GitHub API 已啟用 `build_type: workflow`；網址為 `https://wahengchang.github.io/chainq/`，原始回應在 `evidence/github-pages-setting.json`。 |
| 線上首次部署 | ⬜ | workflow 只在 `main` 觸發；需先讓實作分支進入 `main`，再檢查 Actions run 與公開網址。 |
| GitHub 設定頁截圖 | ⬜ | Chrome 沒有 GitHub 登入狀態；未要求、記錄或處理任何帳密，因此目前以 API 回應留證。 |

以下四種視圖保留立項時的完整 Pre-Spike 基線；其中「尚未建立」等文字描述的是當時狀態，實作後狀態以上表為準。

## 盤點邊界與標記

原始 Pre-Spike 只做盤點；在你確認「全部留在同一 repository」後，已進入 Phase 1。仍不建立新 GitHub repository；GitHub Pages 設定要等本機 build、check、test 與 headed Playwright 全部通過後才操作。

三態標記表示「開始實作前的清晰度」，不是完成度：

| 標記 | 意義 |
|---|---|
| ✅ | 一開始就清晰，可直接做；仍可能受前置決策阻擋 |
| ⬜ | 需要 Spike；本文件必須寫出要回答的核心問題 |
| ❓ | 需要你確認；這是產品、範圍、所有權或憑證決策，不應由工程實驗代替 |

風險優先序：`P0` 會改變 repository／部署拓撲或第一階段成敗；`P1` 影響跨 repository 與同步正確性；`P2` 是後續增強，不阻擋最小閉環。

---

## 1. 主模組總覽

| ID | 主模組 | 一句話職責 | 已知現況／可檢查錨點 |
|---|---|---|---|
| M1 | 交付工作區與證據 | 隔離實作分支，集中保存決策、操作紀錄與 GitHub／網站截圖。 | worktree 與 branch 已建立；`evidence/screenshots/` 已有本機真實網站畫面。 |
| M2 | 來源文件 repositories | 持有 canonical Markdown、圖片、examples 與每個檔案的 Git history。 | 目前只確認 `wahengchang/chainq`；有 `README.md`、21 份 `docs/**/*.md`、10 張 `docs/screenshots/*`。 |
| M3 | 中央文件網站 | 用 Astro + Starlight 將人工與生成 Markdown 組成可導航的靜態網站。 | 已在 `docs-site/` 建立 Astro 7.1.6 + Starlight 0.41.6；18 個 allowlisted pages 可 build。 |
| M4 | 同步與來源追蹤 | 依 allowlist 同步指定文件，注入來源 repo/path/SHA/time，修正連結與資產。 | Phase 3 提案完整，但 manifest、生成位置與 transform 實作皆尚未建立。 |
| M5 | 自動化、事件與權限 | 接收 push／手動／跨 repo 事件，安全地 checkout、build、驗證與 deploy。 | chainq 只有產品 CI：`.github/workflows/ci.yml`；尚無 docs deploy／notify workflow。 |
| M6 | GitHub Pages 發布面 | 保存最後成功的 Pages artifact，提供 project-site URL。 | 實際 Pages 狀態未查證；預定 URL 形式為 `https://<owner>.github.io/<docs-repository>/`。 |
| M7 | 驗證、觀測與交接 | 證明路由、日期、事件、同步、失敗保護與線上畫面都是真實可用。 | 現有產品測試可作來源基線；docs-site 測試、browser smoke 與部署證據尚不存在。 |

---

## 2. 模組關係與交互

### 2.1 依賴與資料流

```text
                         ┌────────────────────────────┐
                         │ M1 交付工作區／證據         │
                         │ worktree · project/ · PNG  │
                         └──────────────▲─────────────┘
                                        │ 操作紀錄、驗收截圖、URL、run ID
                                        │
┌──────────────────────────┐            │
│ M2 source repositories   │            │
│ Markdown · assets · Git  │            │
└───────┬───────────┬──────┘            │
        │           │ push(paths)       │
        │           ▼                   │
        │    ┌──────────────────────┐   │
        │    │ M5 notify workflow   │   │
        │    │ repository + SHA     │   │
        │    └──────────┬───────────┘   │
        │               │ repository_dispatch(event_type, payload)
        │ manifest      ▼               │
        │ + full Git ┌───────────────────────────────┐
        └───────────►│ M5 central build workflow     │
                     │ checkout(fetch-depth: 0)      │
                     └───────┬───────────────┬───────┘
                             │               │
                             ▼               │
                    ┌─────────────────┐      │
                    │ M4 sync/metadata│      │
                    │ generated MD    │      │
                    │ assets/report   │      │
                    └────────┬────────┘      │
                             │ frontmatter + files
                             ▼               │
                    ┌─────────────────┐      │
 manual Markdown ──►│ M3 Starlight    │      │
                    │ routes/sidebar  │      │
                    │ lastUpdated     │      │
                    └────────┬────────┘      │
                             │ static build  │
                             ▼               │
                    ┌─────────────────┐      │
                    │ M7 validation   │──────┘
                    │ links/assets/etc│ pass 才可發布
                    └────────┬────────┘
                             │ Pages artifact
                             ▼
                    ┌─────────────────┐
                    │ M6 GitHub Pages │
                    │ last good site  │
                    └────────┬────────┘
                             │ public URL / rendered page / timestamps
                             └──────────────────────► M7 browser verification
```

### 2.2 關鍵交換契約

| 從 → 到 | 交換物 | 關鍵參數／重要資訊 | 真相來源 |
|---|---|---|---|
| M2 → M5 | source push 事件 | `repository`、`sha`、`ref`、受影響 paths | GitHub event payload |
| M5 notify → M5 central | `repository_dispatch` | `event_type: source-docs-updated`、`client_payload.repository`、`client_payload.sha` | notify workflow |
| M2 → M4 | manifest 指定的來源 | `source-key`、`repository`、`branch/ref`、`from`、`to` | `sync-manifest.yml` |
| M2 Git history → M4/M3 | 檔案版本資訊 | 完整 clone、file commit time、source HEAD SHA | `git log -1 -- <path>`、`git rev-parse HEAD` |
| M4 → M3 | generated Markdown | `title`、`lastUpdated`、`sourceRepository`、`sourcePath`、`sourceCommit`、`generated` | 同步腳本產物 |
| M4 → M3/public | 本地化圖片資產 | source asset path、固定輸出 path、project-site base | sync/asset rewrite 規則 |
| M3 → M5 | 靜態 build | Astro output、build exit code、`site`、`base` | `astro.config.mjs` + lockfile |
| M5 → M6 | Pages artifact | artifact、environment、deployment URL、workflow run SHA | GitHub Actions deployment |
| M6 → M7 | 線上行為 | URL、HTTP 成功、route、sidebar、頁面日期、來源資訊 | 實際 Pages 網站 |
| M7 → M1 | 可回看證據 | screenshot、run URL、commit SHA、時間、驗收結果 | `evidence/screenshots/` + project notes |

### 2.3 資料所有權邊界

```text
source repo Git       = 同步文件內容與 source history 的唯一真相來源
central repo manual/  = 中央網站人工頁面的唯一真相來源
central repo generated/ = 可重建產物，不可人工編輯
build-info.json       = 本次 build/deploy 的版本快照，不代表頁面內容日期
GitHub Pages          = 最後一次成功 deploy 的呈現面，不是內容編輯來源
```

不能混用的時間：

| 欄位 | 定義 |
|---|---|
| `pageLastUpdated` | 該頁 canonical source file 的最後 commit 時間 |
| `sourceCommit` | 同步時來源 repository 的 SHA |
| `docsCommit` | 中央文件 repository 的 SHA |
| `builtAt` | 本次網站 build 時間 |

---

## 3. 子模組拆解

### M1 交付工作區與證據

| 子模組 | 內容 |
|---|---|
| Git worktree | 實作 branch 與實體目錄；要等中央 repo 拓撲確認後才能選正確 parent repository。 |
| 立項資料夾 | 本次 `project-2026-08-01-1041/`，集中 project.md、結構化盤點與後續確認檔。 |
| 網頁證據 | `evidence/screenshots/` 保存 GitHub Pages 設定、Actions 成功／失敗、網站頁面與 last-updated 驗證。 |
| 操作索引 | 每張圖需能對回 repository、commit、workflow run、URL 與驗收項目。 |

### M2 來源文件 repositories

| 子模組 | 現況與候選範圍 |
|---|---|
| 產品入口 | `README.md`、`CHANGELOG.md`。 |
| Getting started | `docs/getting-started.md`。 |
| CLI 文件 | `docs/cli/` 共 5 份：索引、tutorial、how-to、reference、explanation。 |
| FAQ | `docs/faq/FAQ.md`。 |
| 場景文件 | `docs/scenario/` 共 9 份，含 5 種 node、接線與 web UI 操作。 |
| 工程內部文件 | `docs/design.md`、`docs/design/*.md`、`docs/test-plan.md`；預設不應公開，需明確 allowlist。 |
| 結構化／原型文件 | `docs/tasks-eng-review.jsonl`、`docs/iteration-pane-wireframe.html`；不是一般公開 Markdown。 |
| 圖片 | `docs/screenshots/` 共 10 張；目前 Markdown image reference 只掃到 README 使用 1 張。 |
| Git history | 已能對不同文件取得不同最後 commit 時間，適合作為 `lastUpdated` 實驗資料。 |
| 既有 CI | `.github/workflows/ci.yml` 執行 typecheck、unit、CLI E2E、browser E2E；不是文件部署 workflow。 |

目前 Markdown 形態：

| 指標 | 觀察 |
|---|---|
| `docs/**/*.md` | 21 份 |
| 有 frontmatter 的文件 | 0 份 |
| 本地相對 Markdown links | 91 個 |
| 掃描到的 missing local link | 1 個：`docs/cli/explanation.md -> ../../draft.md` |
| Markdown image references | 1 個 |
| HTML tags（粗略語法掃描） | 100 個；需在 Starlight/Markdown parser 下實際 compile 才能判定相容性 |

### M3 中央文件網站

| 子模組 | 職責 |
|---|---|
| Astro runtime | 靜態 build 與 project-site base path。 |
| Starlight integration | 文件 layout、sidebar、導航、search 與 `lastUpdated` 呈現。 |
| Content collections | `src/content/docs/` 內人工與生成頁面的路由邊界。 |
| Manual pages | 中央 repo 自己維護的首頁、產品索引與指南。 |
| Generated pages | M4 產出的文件；帶來源 metadata 與禁止人工修改標記。 |
| Public assets | favicon、人工圖片、同步後的 source assets。 |
| Site config | `site`、`base`、title、social repository、sidebar 策略。 |
| Build metadata | `src/generated/build-info.json` 或等價位置，保存 `builtAt/docsCommit/sourceCommits`。 |

### M4 同步與來源追蹤

| 子模組 | 職責 |
|---|---|
| Manifest loader | 只讀 allowlist，不做 `docs/**/*.md` 全量 glob。 |
| Source checkout adapter | 取得指定 repo/ref 的完整 Git history。 |
| Markdown transformer | 讀檔、合併 frontmatter、保留 body。 |
| Metadata resolver | 取得 source repo/path/HEAD SHA/file last commit time。 |
| Route mapper | `from` → `to`，阻擋重複 route。 |
| Link rewriter | 重寫相對文件連結與 repository links。 |
| Asset synchronizer | 複製圖片到中央 public path 並重寫 URL。 |
| Orphan cleaner | manifest 移除項目後刪除上輪 generated page／asset。 |
| Sync reporter | 列出每頁來源、SHA、時間、輸出 path 與警告。 |

### M5 自動化、事件與權限

| 子模組 | 職責 |
|---|---|
| Central deploy workflow | `push main`、`workflow_dispatch`、`repository_dispatch` → build → deploy。 |
| Source notify workflow | relevant paths 改動時向中央 repo 發 dispatch。 |
| Event receiver | 解析 `event_type` 與 payload，不信任未驗證欄位作任意 checkout path。 |
| Permissions | 中央 workflow 使用 `contents: read`、`pages: write`、`id-token: write`。 |
| Cross-repo credential | fine-grained PAT／GitHub App／其他方案；需最小權限與 secret 管理。 |
| Path filters | 只在公開文件真的受影響時觸發。 |
| Concurrency | 避免 deploy race，決定保留舊 build 或取消舊 build。 |
| Failure gate | build／validation 失敗時 deploy job 不執行。 |

### M6 GitHub Pages 發布面

| 子模組 | 職責 |
|---|---|
| Repository Pages setting | `Settings → Pages → Source: GitHub Actions`。 |
| Project-site URL | `https://<owner>.github.io/<docs-repository>/`。 |
| Base-path correctness | HTML route、JS/CSS、圖片與內部 links 都必須包含正確 base。 |
| Deployment environment | `github-pages` environment 與實際 deployment URL。 |
| Last-good behavior | 新 build 失敗時不可覆蓋現有線上版本。 |

### M7 驗證、觀測與交接

| 子模組 | 驗證內容 |
|---|---|
| Local compile | Markdown/MDX、frontmatter、Astro production build。 |
| Link/asset validation | broken internal link、missing image、project-site base。 |
| Route validation | duplicate routes、生成／人工頁碰撞。 |
| Metadata validation | source repo/path/SHA/lastUpdated 完整且可 parse。 |
| Last-updated experiment | 兩頁不同 commit 時間；改 A 不應更新 B。 |
| Dispatch experiment | source repo + SHA 可被中央 workflow 觀察。 |
| Sync experiment | 單頁 → 多來源 → manifest 刪除清理。 |
| Browser verification | 實際打開 Pages 網站，檢查導航、頁面、圖片、日期與來源資訊。 |
| Evidence capture | 截圖與 run URL 對應驗收項目，而不是只寫「passed」。 |

---

## 4. 主要工作細節

### Phase 0：立項、拓撲與基線

| ID | 工作 | 完成／驗收證據 | 前置依賴 |
|---|---|---|---|
| W01 | 決定中央文件網站是新獨立 repo，還是放在 chainq repo。 | 明確 repository 拓撲圖與 ownership。 | 你確認。 |
| W02 | 決定 owner、docs repo 名稱、visibility、預定 Pages URL。 | 無 `<owner>/<docs-repository>` 佔位符。 | W01、你確認。 |
| W03 | 在正確 repository 建立實作 branch 與 Git worktree。 | `git worktree list`、branch 名與乾淨基線。 | W01–W02。 |
| W04 | 建立 project/evidence 結構。 | 本資料夾與 `evidence/screenshots/`。 | 無；本回合已完成。 |
| W05 | 只讀查核 GitHub 現況：Pages、Actions、owner root site、branch protection。 | 截圖＋查核結果，不改設定。 | W02。 |
| W06 | 固定 source repo 基線、文件盤點、測試健康度。 | HEAD、檔案數、link 掃描、typecheck/test 結果。 | 無；本回合已完成。 |

### Phase 1：中央網站與自動發布閉環

| ID | 工作 | 完成／驗收證據 | 前置依賴 |
|---|---|---|---|
| W10 | 初始化 Astro + Starlight 專案並固定 lockfile。 | 本地 dev/build 可重現。 | W03。 |
| W11 | 設定 `site`、`base`、title、social、`lastUpdated`。 | project-site route 與資產路徑正確。 | W02、Spike。 |
| W12 | 建立首頁、product、guide 三個最小頁面與 folder routes。 | 三個 route 與 sidebar 可見。 | 公開內容範圍確認。 |
| W13 | 定義既有 Markdown 的 frontmatter 最小契約與匯入方式。 | 既有文件可 compile，不破壞標題／連結。 | Markdown compatibility Spike。 |
| W14 | 建立 central deploy workflow。 | push main、manual dispatch 均能 build；build/deploy 分 job。 | Action/version Spike。 |
| W15 | 用瀏覽器把 Pages source 設為 GitHub Actions。 | 設定頁截圖。 | W02、W14。 |
| W16 | 執行 local production build 與 link/asset validation。 | exit 0、validation report。 | W10–W13。 |
| W17 | 首次 push/deploy，確認 Pages URL。 | Actions run URL、deployment URL、網站截圖。 | W14–W16。 |
| W18 | 驗證每頁真正最後 commit 時間。 | 兩頁不同日期、改 A 不動 B 的 commit＋畫面證據。 | `lastUpdated` Spike、full history。 |
| W19 | 驗證 build 失敗不覆蓋線上版本。 | 故意失敗的 run 與舊版仍可用的證據。 | W17。 |
| W20 | README 記錄本地開發、build、deploy、失敗排查。 | 新工程師可照文件重現。 | W10–W19。 |

### Phase 2：來源 repo 觸發中央重建

| ID | 工作 | 完成／驗收證據 | 前置依賴 |
|---|---|---|---|
| W21 | central workflow 接收 `source-docs-updated`。 | dispatch event 能啟動 workflow。 | Phase 1。 |
| W22 | 在每個 source repo 建立 `notify-docs.yml`。 | relevant commit 自動送 dispatch。 | source repos 確認。 |
| W23 | 對每個 source repo 定義 relevant path filters。 | 文件相關 commit 觸發，無關 commit 不觸發。 | canonical/public 範圍確認。 |
| W24 | 驗證 cross-repo 最小權限方案。 | 權限矩陣與成功/拒絕測試。 | Security Spike。 |
| W25 | 在 GitHub 建立 credential/secret 與必要設定。 | secret 名存在；logs 無 token；設定截圖不含 secret 值。 | W24、授權方案確認。 |
| W26 | 保留 `workflow_dispatch` 手動重建。 | Actions UI 可手動啟動。 | W14。 |
| W27 | 驗證 payload、快速連續 dispatch 與 concurrency。 | repository/SHA 可觀察，無 deploy race。 | W21–W25。 |
| W28 | 保存 Phase 2 的 Actions、設定與結果證據。 | 截圖、run URL、source/docs SHA 對照。 | W21–W27。 |

### Phase 3：選擇性同步與來源追蹤

| ID | 工作 | 完成／驗收證據 | 前置依賴 |
|---|---|---|---|
| W31 | 定義 `sync-manifest.yml` schema 與第一批 allowlist。 | 明確 `repository/ref/from/to`，無全量 glob。 | source/page ownership 確認。 |
| W32 | workflow checkout 一個或多個來源 repo，保留完整 history。 | source path 與 SHA 可重現。 | W24、repo visibility。 |
| W33 | 實作 manifest/file existence validation。 | missing source 讓 build 明確失敗。 | W31–W32。 |
| W34 | 實作 source repo/path/SHA/file time 解析。 | 每頁 metadata 與 Git 指令一致。 | W32。 |
| W35 | 合併/注入 frontmatter，保留標題與 body。 | generated page compile 且日期語義正確。 | frontmatter Spike。 |
| W36 | 同步圖片到中央 `public/generated/...` 並重寫 URL。 | project-site 線上圖片正常、orphan asset 可清。 | Asset Spike。 |
| W37 | 重寫 Markdown 相對 links 與 source links。 | 內部 link 全通，無誤改 code fence。 | Link-rewrite Spike。 |
| W38 | 分隔 manual/generated，清理 manifest 已移除的 orphan。 | 移除 item 後 page/asset 都消失。 | W31、generated-location Spike。 |
| W39 | 建立 generated-doc validation。 | broken link、missing image、duplicate route、metadata 缺失皆阻擋 deploy。 | W33–W38。 |
| W40 | 生成 sync/build report。 | 每頁顯示來源版本與輸出位置。 | W34、W39。 |
| W41 | 從單一 README 擴到多 repo、多頁。 | 無 route collision；報告列出各來源 SHA。 | source repos/allowlist 確認。 |
| W42 | 自動化測試與實際 browser 驗收。 | sync、cleanup、failure、Pages 畫面與截圖全有證據。 | W31–W41。 |

### 測試與失敗路徑

```text
ENTRY A: central Markdown push
  → checkout full history
  → [validation fail] ──► workflow 紅燈；deploy 不執行；舊網站保留
  → [validation pass]
  → Astro build
  → [build fail] ───────► workflow 紅燈；deploy 不執行；舊網站保留
  → [build pass]
  → Pages deploy
  → browser smoke：route/sidebar/assets/lastUpdated

ENTRY B: source relevant-path push
  → notify workflow
  → [auth/dispatch fail] ► source workflow 明確失敗，不可靜默
  → repository_dispatch(repository, sha)
  → concurrency 決定本次有效 SHA
  → 回到 ENTRY A 的 central build path

ENTRY C: Phase 3 sync
  → checkout manifest sources with full history
  → validate source/ref/file
  → transform frontmatter/links/assets
  → remove generated orphans
  → validate metadata/routes/links/assets
  → 回到 ENTRY A 的 Astro build path
```

| 新路徑 | 現實失敗模式 | 必要測試 | 錯誤處理／使用者可見性 |
|---|---|---|---|
| full-history checkout → `lastUpdated` | shallow clone 仍能 build，但所有頁日期錯誤，屬高風險靜默錯誤。 | 兩頁不同 commit 的 regression test；線上日期對 `git log`。 | workflow 明確用 full history；驗收失敗須阻擋 Phase 1 完成。 |
| project-site `base` | HTML 可開，但 CSS、圖片或內部 link 指向 root 而 404。 | production preview + Pages browser smoke。 | link/asset validator + 可觀察 404；不只看首頁 200。 |
| deploy job dependency | build 失敗仍觸發 deploy，覆蓋最後好版本。 | 故意 broken Markdown/build 的 E2E。 | deploy `needs: build`；失敗 run 與舊站存活都可見。 |
| source notify → dispatch | token 權限不足／過期，source push 後中央完全沒重建。 | 成功 dispatch + 降權/無效 token rejection。 | source workflow 必須紅燈，禁止吞掉 API exit code。 |
| dispatch burst → concurrency | 舊 SHA 最後完成，反而覆蓋較新的網站。 | 連發多次，核對 deployment SHA。 | 明確 `cancel-in-progress` 契約；deployment report 顯示 SHA。 |
| manifest → source file | 檔案 rename/delete 後同步沿用上一輪舊頁。 | missing source + manifest 移除兩種測試。 | missing source 直接 fail；移除 manifest 必須清 orphan。 |
| frontmatter merge | 蓋掉標題、產生兩個 frontmatter block，或 source time 被 build time 取代。 | 有/無既有 frontmatter、title、特殊字元 fixture。 | transformer 報告欄位來源；invalid frontmatter 阻擋 build。 |
| link rewrite | regex 誤改 code fence、anchor/query，build 仍可能成功但點擊壞。 | 現有 91 個 local links 加 edge fixtures。 | AST/validator 結果列出 source + target；broken link 阻擋 deploy。 |
| asset sync | 同名圖片互蓋、base path 錯、manifest 移除後留 orphan。 | 跨 source 同名、相對深度、移除 item。 | source-key namespacing + orphan cleanup report。 |
| route mapping | manual 與 generated 或兩來源產生同一路由。 | duplicate route fixture。 | build 前明確列出兩個 owner/path 並失敗。 |
| metadata | page 缺 SHA/path/time，網站仍能顯示但失去追蹤性。 | 每個 generated page schema validation。 | 缺欄位阻擋 deploy；sync report 顯示完整來源。 |
| browser evidence | workflow passed，但實際導航、圖片或日期呈現錯。 | Playwright/瀏覽器走過核心頁面。 | 保存真實 Pages 截圖與 URL，不能只回報 passed。 |

### 明確不在目前範圍

| 延後項目 | 理由 |
|---|---|
| 文件內容品質重寫 | handover 明確只處理發布與同步系統，避免把內容改版混進基礎設施驗證。 |
| 完整 information architecture／導覽改版 | Phase 1 只需用 folder routing/sidebar 證明自動網站閉環。 |
| custom theme／品牌視覺 | 先保留 Starlight 預設 UI，避免視覺工作掩蓋 route/deploy 問題。 |
| analytics／custom domain | 不影響最小成功定義，且會新增隱私、DNS 與設定面。 |
| PR preview deployment | handover 將它列為後續未知，不阻擋 main → Pages。 |
| 把 deploy 狀態回寫 source commit | Phase 2 只要求觸發與可追蹤 payload，回寫會增加權限。 |
| 未經 allowlist 的全量 docs 同步 | 明確禁止，避免 internal/legacy 文件意外公開。 |

---

## 5. 三態分類與 Spike 優先序

### 5.1 每項工作分類

| 工作 | 標記 | 判定 |
|---|---|---|
| W01 中央 repo 拓撲 | ✅ | 已確認使用既有 `wahengchang/chainq`，不建立新 repo。 |
| W02 owner/name/visibility/URL | ✅ | 已確認 owner/repo 與 project-site URL：`https://wahengchang.github.io/chainq/`。 |
| W03 建 worktree | ✅ | 做法清楚，但只能在 W01–W02 後執行。 |
| W04 project/evidence 結構 | ✅ | 已建立。 |
| W05 GitHub 現況查核 | ⬜ P0 | 要回答實際 Pages/Actions/root-site/branch 設定，並留下瀏覽器證據。 |
| W06 source 基線 | ✅ | 已完成；見本文件「已觀察基線」。 |
| W10 Starlight 初始化 | ✅ | 技術方向已由 handover 指定；版本由 S02 固定。 |
| W11 site/base/lastUpdated | ⬜ P0 | project-site base 與目前 Starlight 行為需用 production build/Pages 證明。 |
| W12 三個最小頁面 | ❓ | 頁面骨架清楚，但使用哪三份真實內容需你確認。 |
| W13 frontmatter 契約 | ⬜ P0 | 現有 21 份 docs 都沒有 frontmatter；需驗證最小轉換。 |
| W14 deploy workflow | ⬜ P0 | workflow 結構清楚，但 Action major、Node/package manager 要用當前版本驗證。 |
| W15 Pages UI 設定 | ✅ | 操作清楚；W05/W14 後直接做並截圖。 |
| W16 local build/validation | ✅ | 驗收方式清楚。 |
| W17 首次 deploy | ✅ | 閉環清楚；依賴前面設定。 |
| W18 真實 lastUpdated | ⬜ P0 | 需回答 Starlight 是讀中央檔案 Git history，還是接受同步注入時間。 |
| W19 失敗不覆蓋 | ✅ | build/deploy job dependency 可直接設計並驗證。 |
| W20 README | ✅ | 內容邊界與驗收清楚。 |
| W21 dispatch receiver | ✅ | event contract 已明確。 |
| W22 notify workflow | ✅ | 結構清楚；repo 清單待確認。 |
| W23 relevant paths | ❓ | 哪些 code/schema 會改變公開文件屬產品 ownership，不能只靠 glob 猜。 |
| W24 cross-repo 權限 | ⬜ P0 | 要回答 fine-grained PAT 的最小可行權限及替代方案。 |
| W25 credential/secret | ❓ | 實作方式取決於 W24 後選定 PAT/GitHub App 等方案。 |
| W26 manual rebuild | ✅ | 可直接做。 |
| W27 payload/concurrency | ⬜ P1 | 要回答 dispatch burst 下 `cancel-in-progress` 的實際結果。 |
| W28 Phase 2 證據 | ✅ | 格式與位置已定義。 |
| W31 manifest + allowlist | ❓ | schema 清楚，但哪些頁可公開／canonical owner 是誰需確認。 |
| W32 source checkout | ⬜ P1 | private/public repo 的 auth 與 full-history 成本需實測。 |
| W33 source existence validation | ✅ | 失敗契約清楚。 |
| W34 source metadata | ✅ | Git 指令與欄位語義清楚。 |
| W35 frontmatter 注入 | ⬜ P1 | 要回答 Starlight 對自訂 `lastUpdated` 的乾淨整合方式。 |
| W36 asset sync | ⬜ P1 | 要回答相對圖片、重名、base path 與 orphan asset 規則。 |
| W37 link rewrite | ⬜ P1 | 要回答 AST parser 或 regex；現有 91 個本地 link 是實驗樣本。 |
| W38 generated 邊界/清理 | ⬜ P1 | 邊界原則清楚；generated 應 commit 或只存在 CI workspace 需實驗。 |
| W39 validation | ✅ | 檢查清單清楚；工具選型可在實作時決定。 |
| W40 sync report | ✅ | 欄位與目的清楚。 |
| W41 多來源擴展 | ❓ | 尚未確認 chainq 之外的 source repositories。 |
| W42 自動化＋browser 驗收 | ✅ | 驗收矩陣清楚，依賴前面工作完成。 |

### 5.2 Spike backlog（依風險排序）

| Spike | 優先 | 要回答的核心問題 | 最小實驗與退出證據 |
|---|---|---|---|
| S01 GitHub/Pages 現況 | P0 | owner 是否已有 `<owner>.github.io`；目標 repo 是否已存在；Pages/Actions/branch 設定會不會衝突？ | 用已登入瀏覽器只讀查核；保存頁面截圖與明確結論。 |
| S02 版本與 toolchain | P0 | 當前 Astro、Starlight、`withastro/action`、Pages actions、Node 與 lockfile 的可重現組合是什麼？ | 查官方 current docs，最小 scaffold + production build；固定版本與 lockfile。 |
| S03 project-site base | P0 | `site/base` 下 route、JS/CSS、圖片、root-relative links 是否全部正確？ | 本地 preview + Pages deploy，逐一點 route/assets。 |
| S04 `lastUpdated` | P0 | full history 下人工頁日期是否正確；同步頁能否可靠使用 source file time，而不被中央生成 commit 覆蓋？ | 兩頁／兩個 commit；比較 `git log`、built HTML 與線上畫面。 |
| S05 現有 Markdown 相容性 | P0 | 0 frontmatter、HTML、相對 links 的既有文件能否直接 compile；最小 normalize 契約是什麼？ | 選 CLI reference、FAQ、web-ui 三種樣本 build；列出必要 transform。 |
| S06 deploy workflow/action versions | P0 | handover 中 action major 在當前是否仍正確；失敗 build 是否確實不 deploy？ | 成功/故意失敗各一個 run；保存 run URL。 |
| S07 cross-repo 最小權限 | P0 | `repository_dispatch` 用 fine-grained PAT 時真正最小 permission 是什麼；GitHub App 是否現在就值得？ | 最小權限 token 成功，降權後拒絕；logs 無 token。 |
| S08 dispatch concurrency | P1 | burst dispatch 應保留舊 deploy 還是只留最新；哪個行為不會發布舊 SHA？ | 連發 2–3 次，觀察 cancelled/completed/deployed SHA。 |
| S09 frontmatter override | P1 | 同步注入的 source time 要放哪個欄位／hook，Starlight 才會正確顯示？ | 單頁同步 PoC，畫面日期等於 source `git log`。 |
| S10 link/asset rewrite | P1 | AST 或 regex 才不會誤改 code fence、anchor、query、圖片與跨頁相對路徑？ | 用現有 91 個 local links + 圖片 fixture；輸出 zero broken link。 |
| S11 generated 保存位置 | P1 | generated pages 應 commit 進 central repo，或只在 CI temporary workspace 生成？ | 比較可追蹤性、diff review、orphan cleanup 與 local dev；記錄決策。 |
| S12 source checkout auth | P1 | 多 source、private repo 時如何用最小讀權限並保留 full history？ | 一個 public + 一個 private 測試 repo（若實際需要）。 |
| S13 source 產品測試基線 | P2 | 本機偵測到 `claude` 但未能完成 real-model E2E 時，docs trigger 是否會被無關測試阻擋？ | 決定 docs workflow 是否獨立；不得把 real-model 測試當 docs deploy 必要條件。 |

差距集中處一句話：**Phase 1 的技術形狀已清楚，真正 P0 缺口集中在 repository/Pages 拓撲、當前版本契約、project-site base、lastUpdated 語義與跨 repo 最小權限。**

---

## 6. 結構化設定／文件盤點

沒有資料庫，因此不建立 database schema。這個專案有多個設定契約需要在 Spike 前對齊，已整理到：

- [`config-map.yaml`](./config-map.yaml)：已知 repository、source docs inventory、待定 site config、dispatch payload、page metadata、manifest schema 與驗證基線。
- [`evidence/screenshots/README.md`](./evidence/screenshots/README.md)：後續 GitHub 與實際網站截圖命名、必拍清單與索引規則。

`config-map.yaml` 是盤點文件，不是可直接部署的 runtime config；所有 `pending_confirmation`／`pending_spike` 都不得原樣進正式 workflow。

---

## 待我確認的問題

按阻擋順序排列；在你回覆前不腦補：

1. **中央 repository 拓撲**：要建立全新的 `wahengchang/<docs-repository>`，還是直接在 `wahengchang/chainq` 加 docs site？如果是新 repo，Git worktree 應開在新 repo clone，而不是 chainq。
2. **repository 名稱與 URL**：`<docs-repository>` 的正式名稱是什麼？owner 是否確定為 `wahengchang`？
3. **本次實作範圍**：下一階段只做到 Phase 1，還是 Phase 1–3 全部完成？handover 推薦分三個 PR。
4. **來源 repositories**：目前只把 `wahengchang/chainq` 視為已知來源；還有哪些 repo 要納入？各自 public/private？
5. **公開 allowlist**：是否同意先以 `README.md`、`CHANGELOG.md`、`docs/getting-started.md`、`docs/cli/`、`docs/faq/`、`docs/scenario/` 作候選，並預設排除 `docs/design*`、`docs/test-plan.md`、JSONL 與 wireframe？
6. **canonical owner**：同步頁由 source repo 維護、中央 repo 不人工改，是否符合期待？哪些頁要改成中央人工頁？
7. **網站最小識別**：網站 title、預設語言與首頁名稱是什麼？本階段是否只保留 Starlight 預設視覺？
8. **跨 repo 憑證方向**：Spike 後可否由我依最小權限結果選 fine-grained PAT，還是你要求一開始就用 GitHub App？
9. **既有 root site**：如果 `wahengchang.github.io` 已有內容，是否一律不得更動，只建立 project site？handover 的預設答案是「不得覆蓋」。

---

## 已觀察基線

| 項目 | 結果 | 證據／備註 |
|---|---|---|
| Git | `main` at `7616818`；原始工作樹只有未追蹤 `AGENTS.md`。 | `git status --short --branch`、`git log`。 |
| Remote | `https://github.com/wahengchang/chainq.git`。 | `git remote -v`。 |
| TypeScript | ✅ 主程式與 UI typecheck 通過。 | `bunx tsc --noEmit`；`bunx tsc -p src/web/ui/tsconfig.json`。 |
| Unit tests | ✅ 13 files、129 tests passed。 | `bun run test`。 |
| CLI E2E offline baseline | ✅ 25 passed、9 real-model tests skipped。 | 使用臨時 PATH 隱藏 `claude`，`bun run e2e`。 |
| CLI E2E local real-model path | ⚠️ 偵測到 `claude` 後至少 4 個 real-model cases 失敗；不是 docs-site 實作結果。 | 初次 `bun run e2e` 的既有環境行為。 |
| Browser E2E inventory | 31 specs、靜態掃描 40 tests；本回合沒改 UI，未執行 headed browser。 | `e2e/browser/*.spec.ts`。 |
| Docs site | ❌ 尚無 Astro/Starlight、deploy workflow、sync scripts、manifest。 | `git ls-files`、`package.json`、`.github/workflows/ci.yml`。 |
| GitHub settings | 未查證。 | 指定的 `/opt/homebrew/bin/gh` 不存在；依需求留到 S01 用瀏覽器查核並截圖。 |
