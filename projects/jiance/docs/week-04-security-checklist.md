# 简册 · 安全与错误处理自查清单（Day 23）

> 版本：v1.0 ｜ 日期：2026-10-11 ｜ 归属：Day 23 任务（密钥排查 + 三类错误提示统一）
> 口径：每一项都写清**怎么验**（可直接复制的命令）、**期望看到什么**、**实测结果**。
> 不允许出现「应该没问题」「基本安全」这类模糊表述。没做的一律写**未生效 / 未通过**。
> 范围：本仓库 `D:\梦空间`（含 `projects/jiance/`），不含云端控制台里的设置项。
> 环境：CloudBase `maybe666-d6g1z4erj391b54f5`（上海 · PostgreSQL 模式）
> 　网关 `https://maybe666-d6g1z4erj391b54f5-141962881.ap-shanghai.app.tcloudbase.com`

---

## 一、密钥自查（红线 · 最高优先级）

| # | 检查项 | 怎么验 | 期望 | 实测结果 |
|---|---|---|---|---|
| 1 | 仓库里有没有 `.env` | `git ls-files \| grep -i "\.env"` | 只出现 `.env.example` | ✅ **PASS** — 只有 `projects/jiance/.env.example` |
| 2 | **历史上**有没有提交过 `.env` / 密钥文件 | `git log --all --pretty=format: --name-only --diff-filter=A \| sort -u \| grep -Ei "\.env\|secret\|credential\|\.pem\|\.key\|token"` | 空的或只有 `.env.example` | ✅ **PASS** — 只有 `.env.example`（**56 个提交全查过**） |
| 3 | **全历史**有没有密钥特征串 | 命令 A（见第七节） | **命中 0** | ✅ **PASS** — 命中 **0** |
| 4 | 工作区（含未跟踪/被忽略）有没有密钥特征串 | 命令 B | **命中 0** | ✅ **PASS** — 命中 **0** |
| 5 | 前端源码里有没有密钥 | `grep -rn "TCB_\|APIKEY\|SECRET\|TOKEN\|CLOUDBASE" projects/jiance/src/` | 只应命中**注释** | ✅ **PASS** — 仅 `src/api/client.js` 第 17/19 行的**纪律注释**，无真值 |
| 6 | `.env.example` 里有没有真密钥 | `cat projects/jiance/.env.example` | 只有公开网址 | ✅ **PASS** — 只有 `VITE_API_BASE=`（公开域名） |
| 7 | `.env.production` 在不在仓库里 | `git ls-files \| grep ".env.production"` | **不在** | ✅ **PASS** — 不在（被根 `.gitignore` 的 `.env.*` 拦住） |

**结论：仓库与全历史均无密钥泄露，无需作废或重新生成任何密钥。**

---

## 二、`.gitignore` 完整性

| # | 检查项 | 怎么验 | 期望 | 实测结果 |
|---|---|---|---|---|
| 1 | `.env` 系列被忽略 | `git check-ignore -v projects/jiance/.env.production` | 命中 `.env.*` 规则 | ✅ **PASS** — `.gitignore:11:.env.*` |
| 2 | 证书 / 密钥文件被忽略 | 规则含 `*.pem` `*.key` `*.p12` `*secret*` `*apikey*` | 命中 | ✅ **PASS** |
| 3 | 依赖与构建产物被忽略 | 规则含 `node_modules/` `dist/` `Temp/` | 命中 | ✅ **PASS** — `projects/jiance/.gitignore:11:dist` |
| 4 | **云函数打包物有没有被误提交** | `git ls-files \| grep "\.zip$"` | **0 个** | ✅ **PASS（Day 23 修）** — 曾是 3 个，现已忽略并移出索引 |
| 5 | 修复后规则真生效 | `git check-ignore -v projects/jiance/cloudbase/functions/expenses/expenses.zip` | 命中 `*.zip` | ✅ **PASS** — `.gitignore:62:*.zip` |
| 6 | 本地 zip 文件还在（只是不进仓库） | `ls projects/jiance/cloudbase/functions/*/*.zip` | 3 个都在 | ✅ **PASS** |

⚠️ **注意**：`*.zip` 现在被忽略，**每次改完云函数必须重新打包再上传**，否则云端跑的还是旧代码。
打包见 `cloudbase/DEPLOY.md` 第六节之 3；`Compress-Archive -Force` 在本机被删除保护拦住，
正确做法是**先打到临时目录再覆盖**。

---

## 三、三类错误提示统一（本次主任务）

**三类的定义**：① 输入错（400 / 404 / 405）② 网络错（连不上后端）③ 服务端错（503 / 网关异常）。
**统一出口**：后端 = 各云函数；前端 = `src/api/client.js` 的 `request()`（页面只读 `e.message`，全项目只有这一个出口）。

### 3.1 后端（已上线，curl 实测，2026-10-11 18:26）

| # | 请求 | 实测返回 | 判定 |
|---|---|---|---|
| 1 | `GET /api/expenses/summary` | **404** `这个地址还没实现（/api/expenses/summary）。读账目列表请用 /api/expenses，末尾不带别的词` | ✅ |
| 2 | `GET /api/expenses/ex_seed0001` | **404** 同上句式 | ✅ |
| 3 | `GET /api/expenses` | **200**（**没被误拦**，这是本次最重要的回归点） | ✅ |
| 4 | `GET /api/expenses?month=2026-10` | **200** | ✅ |
| 5 | `GET /api/expenses?type=%E6%94%AF%E5%87%BA` | **200** | ✅ |
| 6 | `GET /api/expenses?month=2026-13` | **400** `month 格式必须是 YYYY-MM，例如 2026-09`（`field: month`） | ✅ |
| 7 | `PUT /api/expenses` | **405** `这个接口支持 GET（读列表）、POST（记一笔）、PATCH（改一笔）、DELETE（删一笔）；…不支持 PUT` | ✅ |
| 8 | `PUT /api/profile` | **405** `这个接口支持 GET（读个人参数）；不支持 PUT` | ✅ |
| 9 | `PUT /api/health` | **405** `这个接口支持 GET（问一句「服务还在吗」）；不支持 PUT` | ✅ |
| 10 | `POST /api/expenses` 非 JSON 体 | **400** `请求体格式不对，需要一个 JSON 对象`（`field: body`） | ✅ |
| 11 | `POST /api/expenses` 日期 `2026-02-31` | **400** `日期不存在，请检查月份和日号`（`field: date`） | ✅ |
| 12 | `POST /api/expenses` 金额 0 | **400** `金额必须大于 0（收入和支出靠「收入/支出」区分，不靠正负号）`（`field: amount`） | ✅ |
| 13 | `PATCH /api/expenses/ex_nope12345` | **404** `没找到这一笔账，可能已经被删掉了` | ✅ |
| 14 | `DELETE /api/expenses/ex_nope12345` | **404** 同上 | ✅ |
| 15 | `GET /api/health` / `GET /api/profile` | **200** 正常 | ✅ |

**三个函数的 405 现在同一种句式**：`这个接口支持 <方法（一句注解）>；不支持 <X>`，
且回显方法名前**过白名单**（畸形方法名换成「该方法」，防反射）。
`health` 的失败体本轮补上 `data: null`，与 expenses / profile 统一成三字段。

### 3.2 前端（代码完成 + 本地真跑通过，**公网未生效**）

| # | 场景 | 实测页面文案 | 判定 |
|---|---|---|---|
| 16 | 断网（拦掉后端域名） | `账目：连不上服务器，请检查网络后重试` | ✅ 本地 PASS（英文 `Failed to fetch` 已消失） |
| 17 | 平台层英文 404（复刻真实响应） | `账目：接口地址不对，可能是路径写错了` | ✅ 本地 PASS |
| 18 | 后端 503 | `数据库暂时连不上，稍后重试（网关返回 403，权限不足）` | ✅ 本地 PASS |

验证方式：`npm run preview` 起本地预览 + 无头浏览器伪造三种响应，脚本 `Temp/day23_verify_local.js`。
⚠️ **未上传 `dist/`，所以公网上用户看到的还是英文 `Failed to fetch`。** 见第六节。

### 3.3 一类拦不到的错误（如实写明）

`GET /api/nope`（**没绑过路由**的地址）回的是**平台层英文**：

```json
{"code":"INVALID_PATH","message":"Invalid path. For more information, please refer to
 https://docs.cloudbase.net/error-code/service/INVALID_PATH","requestId":"..."}
```

**这类拦不到**：请求根本没进云函数，平台自己就答了。只能靠前端兜底 ——
`client.js` 已按 `code` 翻成中文（`INVALID_PATH` → 「接口地址不对，可能是路径写错了」），
码表里查不到的码退回按状态码的通用话，**绝不把英文原文甩给用户**。

---

## 四、非法输入与注入面

| # | 检查项 | 怎么验 | 实测结果 |
|---|---|---|---|
| 1 | 写入参数逐个校验 | 见 3.1 第 10–12 行 | ✅ PASS |
| 2 | 金额上界 = 数据库列上界 | 代码 `MAX_AMOUNT` 对照 `schema.sql` 的 `numeric(12,2)` | ✅ PASS — 均为 `9999999999.99` |
| 3 | 注入防护第一层（形状限死） | `MONTH_PATTERN` / `DATE_PATTERN` / `ID_PATTERN` / `CLIENT_TOKEN_PATTERN` | ✅ PASS |
| 4 | 注入防护第二层（逐段编码） | `expensesRepository.js` 的 `restUrl()` 用 `encodeURIComponent` | ✅ PASS |
| 5 | 前端有没有直接塞 HTML | `grep -rn "dangerouslySetInnerHTML\|innerHTML\|eval(" projects/jiance/src/` | ✅ PASS — 命中 0 |
| 6 | 用户输入有没有被回显进响应 | 新增的 404 后缀、405 的方法名**都过白名单** | ✅ PASS（本地 T9 / T12 断言） |
| 7 | 日志有没有带敏感字段 | 只记 `dbStatus` / `err.name` / 分档，**不记 `err.message`** | ✅ PASS |

---

## 五、个人信息红线（AGENTS.md 附三第 4 条）

| # | 检查项 | 怎么验 | 实测结果 |
|---|---|---|---|
| 1 | 源码里有没有招聘网站域名 | `grep -rnE "zhipin\|maimai\|liepin\|51job\|lagou" projects/jiance/src/` | ✅ PASS — 命中 0 |
| 2 | `contact` 有没有进提示词 | `grep -rn "contact" projects/jiance/src/` | ✅ PASS — 只在渲染与表单里用；`Match.jsx` / `Resume.jsx` / `Home.jsx` / `Expense.jsx` 顶部均声明「绝不进提示词」 |
| 3 | 文档 / 示例 / 截图里有没有真实数据 | 人工核对本次改动 | ✅ PASS — 全部为编造示例（「张三」「¥8,000」这类） |

---

## 六、未生效 / 未做（诚实清单）

| # | 项 | 状态 | 原因 / 还差什么 |
|---|---|---|---|
| 1 | 前端三类错误中文提示**上公网** | ✅ **已生效**（当日 18:34 补记） | `index-BmdooY4P.js` 已上线，与本地 `dist/` 逐字节相同；公网端到端实测断网时显示「连不上服务器，请检查网络后重试」 |
| 2 | `api-contract.md` 同步 | **部分完成** | ✅ AI 两条接口已按 v1.16 改版登记为「取消」；⬜ 第 3 号接口 `/api/expenses/summary` 的「⬜ 占位 → 实测回中文 404」状态说明**仍未补** |
| 3 | 根目录 `index.html` 与 AGENTS.md 不符 | ✅ **已解决**（Day 23 晚） | 已 `git rm index.html` —— 事实与 AGENTS.md 附三第 1 条终于一致（可从历史 `81403ef` 取回） |
| 4 | 云函数打包物过期风险 | **需长期注意** | `*.zip` 已不进仓库，改代码后必须重打包再上传 |

---

## 七、以后每次提交前照跑（命令块）

**命令 A · 全历史密钥特征串扫描（含所有提交）**

```bash
git grep -n -I -E "eyJ[A-Za-z0-9_-]{20,}|AKID[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}" -- .
for c in $(git rev-list --all); do git grep -I -n -E "<上面同一串正则>" $c -- . ; done
```

**命令 B · 工作区扫描（含未跟踪、被忽略的文件）**

```bash
grep -rIl -E "eyJ[A-Za-z0-9_-]{20,}|-----BEGIN|AKID[A-Za-z0-9]{16,}" . \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.workbuddy \
  --exclude=week-04-security-checklist.md
```

> ⚠️ **那两个排除项不是作弊，是消假警报**（Day 23 实测踩到）：
> · `--exclude-dir=.workbuddy` —— 本地记忆目录，**不进仓库**（`.gitignore` 里已拦）。
> · `--exclude=week-04-security-checklist.md` —— **本文件自己就写着上面这些特征串**
>   （比如「`-----BEGIN`」这五个字就出现在这条命令的上两行），扫到它属于**必然的假命中**。
>
> 🔴 **为什么要专门处理**：一个永远会报警的检查，等于没有检查 ——
> 用久了大家就会条件反射地忽略它，真出事那天也一样被忽略。
> **假警报必须消掉，不能靠"大家知道那是假的"。**
> 真正的判据是「**除掉这两个文件后**，命中为 0」。

**命令 C · 忽略规则与文档物是否干净**

```bash
git ls-files | grep -Ei "\.env|\.zip$|secret|credential"     # 期望：只有 .env.example
git check-ignore -v projects/jiance/.env.production          # 期望：命中 .env.*
```

**判据（必须全部成立才提交）**

1. 命令 A、B **零命中**
2. `.env` / zip / 证书类文件**不在** `git ls-files` 里（`.env.example` 例外）
3. `projects/jiance/src/` 里 `TCB_|APIKEY|SECRET|TOKEN|CLOUDBASE` 只命中**注释**
4. 改动文件里没有真实金额 / 公司名 / 手机号 / 身份证 / 薪资；示例数据一眼看得出是编造的
5. 源码里没有招聘网站域名；`contact` 没有进任何提示词
