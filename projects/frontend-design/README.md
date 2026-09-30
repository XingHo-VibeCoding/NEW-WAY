# frontend-design 技能 · 归档副本

这个文件夹是 `frontend-design` 技能的**归档副本**，随仓库一起提交到 GitHub。
它不是给软件加载用的那份 —— 作用分工见下表。

## 两份副本的分工

| 位置 | 作用 | 会不会进 Git |
|---|---|---|
| `C:\Users\MAYBE\.workbuddy\skills\frontend-design\` | **工作用的那份**。软件从这里加载技能，任何项目都能调用 | 不进（全局目录） |
| `projects\frontend-design\`（本文件夹） | **项目资产**。随仓库走，换电脑、给同伴看、以后翻查都靠它 | 进 |

**注意**：放在 `projects\` 下不会被软件当成技能加载（技能只从 `.workbuddy/skills/` 读）。
要让技能生效，用的永远是全局那一份。

## 防止两份漂移（重要）

两份文件目前**逐字节相同**（md5 一致）。以后升级请照这个顺序做，别只改一份：

1. 从上游重新取文件（不要手工编辑）
2. **同时替换两份**：全局那份 + 本文件夹这份
3. 用下面这行核对，两边 md5 必须一致

```bash
md5sum "C:/Users/MAYBE/.workbuddy/skills/frontend-design/SKILL.md" \
       "projects/frontend-design/SKILL.md"
```

## 来源与版本

| 项 | 值 |
|---|---|
| 上游仓库 | https://github.com/anthropics/skills |
| 上游路径 | `skills/frontend-design/` |
| 取得日期 | 2026-09-30 |
| 文件 | `SKILL.md`（9,390 字节）、`LICENSE.txt`（10,174 字节） |
| 内容校验 | `SKILL.md` md5 `7d6df6b2e98e38f8b86046325dc6afd0` |

## 这是一份「指导文字」技能

整个技能只有两个文件：一份讲「怎么做不落俗套的视觉设计」的说明，加一份授权条款。
**没有脚本、不联网、不读环境变量**，装的时候按最安全的一档处理（详见
`C:\Users\MAYBE\.workbuddy\skills\install-third-party-skill\` 里的审计流程）。

安装经过与安全审计结论记在 `.workbuddy/memory/2026-09-30.md`。
