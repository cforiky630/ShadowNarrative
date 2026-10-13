# Issue tracker：GitHub

本仓库的 issue 与 spec 都作为 GitHub issue 存在。所有操作走 `gh` CLI。

## 约定

- **建 issue**：`gh issue create --title "..." --body "..."`。正文多行用 heredoc。
- **读 issue**：`gh issue view <number> --json number,title,body,labels,comments`。
- **列 issue**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，配合 `--label` 与 `--state` 过滤。
- **把 issue 挂成某个父 issue 的子 issue**：`gh issue create --parent <parent> ...`，或事后 `gh issue edit <parent> --add-sub-issue <child>`（`gh` 2.94+）。旧版 `gh`：`gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`（此处是**数据库 id**，见下方「阻塞」）。不支持 sub-issue 时，在子 issue 正文顶部写 `Part of #<parent>`。
- **评论**：`gh issue comment <number> --body "..."`
- **加 / 去 label**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **关闭**：`gh issue close <number> --comment "..."`

仓库从 `git remote -v` 推断；在 clone 里跑 `gh` 会自动识别。

## PR 是否算一种请求入口

**PR 作为请求入口：否。** _（如果本仓库把外部 PR 当作 feature request，改成 `是`；`/triage` 会读这个开关。）_

设为 `是` 时，PR 走和 issue 同一套 label 与状态，命令换成 `gh pr` 等价物：

- **读 PR**：`gh pr view <number> --comments`，diff 用 `gh pr diff <number>`。
- **列待 triage 的外部 PR**：`gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`。
- **评论 / 加 label / 关闭**：`gh pr comment`、`gh pr edit --add-label`/`--remove-label`、`gh pr close`。

GitHub 的 issue 和 PR 共用一个编号空间，裸的 `#42` 可能两者都是：先 `gh pr view 42`，不成立再 `gh issue view 42`。

## 当某个 skill 说「发布到 issue tracker」

建一个 GitHub issue。

## 当某个 skill 说「取来相关 ticket」

按上面「读 issue」读。

## Wayfinder 用到的操作

由 `/wayfinder` 使用。**地图**是一个 issue，**票**是它的子 issue。

- **地图**：一个带 `wayfinder:map` label 的 issue，正文放 Notes / Decisions-so-far / Fog。`gh issue create --label wayfinder:map`。
- **子票**：以 GitHub sub-issue 形式挂到地图下（见上面「挂成子 issue」）。sub-issue 未启用时，把子票加进地图正文的任务列表，并在子票正文顶部写 `Part of #<map>`。label 用 `wayfinder:<type>`（`research`/`prototype`/`grilling`/`task`）。被认领后 assign 给推进的开发者。
- **阻塞**：用 GitHub 原生 issue 依赖，这是唯一在 UI 上可见的规范表示。加边：`gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`，其中 `<blocker-db-id>` 是阻塞者的数字**数据库 id**（`gh api repos/<owner>/<repo>/issues/<n> --jq .id`，**不是** `#number`，也不是 `node_id`）。GitHub 通过 `issue_dependencies_summary.blocked_by` 汇报（只含未关闭的阻塞者，即为实时闸门）。依赖功能不可用时，退化为子票正文顶部的 `Blocked by: #<n>, #<n>` 一行。所有阻塞者都关闭，票才解锁。
- **前沿查询**：列出地图下未关闭的子票（`gh issue list --state open`，限定在地图的 sub-issue / 任务列表范围内），剔除有未关闭阻塞者（`issue_dependencies_summary.blocked_by > 0`，或 `Blocked by` 行里还挂着未关闭 issue）或已有 assignee 的；地图顺序里最靠前的胜出。
- **认领**：`gh issue edit <n> --add-assignee @me`，这是该会话的第一次写操作。
- **结票**：`gh issue comment <n> --body "<答案>"`，然后 `gh issue close <n>`，再把一条上下文指针（要点 + 链接）追加到地图的 Decisions-so-far。
