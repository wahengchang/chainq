@AGENTS.md

## Claude Code 專屬

- 執行工作前先檢視本機已安裝的 gstack 指令（例如 `/plan-eng-review`、
  `/review`），在適合的環節使用。
- 若 Claude Code 的非互動 shell 找不到 Node/npm，先載入 NVM 並選用 Node 22；
  不要在專案指引中硬編碼特定 patch 版本的 Node 路徑。
- 若 `gh` 不在 PATH，使用 `/opt/homebrew/bin/gh`。
