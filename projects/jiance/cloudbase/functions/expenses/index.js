'use strict';

/* ============================================================
   简册 · 云函数 expenses
   ------------------------------------------------------------
   文件：functions/expenses/index.js
   功能：GET /api/expenses —— 收支流水「列表读取」
   归属：Day 17（第 3 周第一个业务读接口）
   依据：api-contract.md 第五节第 2 条（成功 200 / 错误 400 / 405 / 503 的全部形状）
        + 第二节通用约定（字段名不改编、日期是文本、金额是正数、type 是中文）

   今天范围：只做「读」。不实现 POST / PUT / DELETE（写入留 Day 18）。
           契约第五节第 4/5/6 条是写接口，今天一行都不写。

   它的位置：课程打卡案例里的 GET /api/favorites 那种「列表读取」。
           Day 16 把表建好了、Day 15 把通道打通了，今天第一次真正
           「从数据库把数据读出来交给前端」——所以它是第 3 周的地基：
           后面 entries（第 7 号）、matches（第 13 号）两个列表接口
           照今天这个文件的写法抄。

   ⚠️ 红线自查（AGENTS.md 附三第 3/4/5 条，写完自己过一遍）：
      · 本文件不出现任何招聘网站名（那 5 个域名见 AGENTS.md 附三第 5 条，
        这里刻意不写出来 —— 写了源码里就真出现了，grep 一扫就命中，
        自己也说不清是「注释」还是「真用了」。规则见文件，名字去规则里查）
      · 不引入任何爬取、不引入任何第三方 SDK
        （**连数据库驱动也不要了**，原因见下面「第 0 段」——这是 Day 17 部署当天
          被平台限制逼出来的改动，不是随意重构）
      · 数据源是**用户自己记账存进来的数据**，不是从任何外部地方拿的
      · 注释里不出现任何真实金额 / 公司名 / 手机号
      · 连接信息只从环境变量读，代码里不硬编码域名和密钥
   ============================================================ */

/* ============================================================
   第 0 段 · 数据访问方式：为什么从 pg 直连改成 HTTP API
   ------------------------------------------------------------
   ⚠️ 这一段是 Day 17 部署当天才补的，读代码前先知道它，否则会以为
      「怎么把写得好好的 pg 删了」。

   【原来】node-postgres（pg）走 PostgreSQL 协议 TCP 直连：
       需要 PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD 五个环境变量，
       其中 PGUSER / PGPASSWORD 是**数据库自己的账号密码**。

   【为什么改】用户用的是 CloudBase **个人版**，不提供数据库连接地址，
       社区 issue #1237 官方回复原话是「在你当前的个人版套餐下，
       就算把这四个值全部填对，TCP 直连也连不上」。
       → 这条路在个人版下走不通，继续在 pg 上打磨是白费力气。

   【现在】改用 CloudBase PostgreSQL 的 **HTTP REST API**。
       官方文档：docs.cloudbase.net/database/postgresql/http/query
         · 基础语法（原文）：
             GET https://<envId>.api.tcloudbasegateway.com/v1/rdb/rest/:table
             Authorization: Bearer <access_token>
         · 原文：「PostgreSQL 数据库的 HTTP API 基于 PostgREST 协议，
                查询语法与 PostgREST 完全兼容」
         · 原文：「`<token>` 可以是登录后获取的 `access_token`、
                Publishable Key 或 API Key」

   【⭐ 最关键的一点：这条路的认证**不需要数据库密码**】
       token 三种来源里，**Publishable Key** 是控制台直接生成的一串key，
       不是数据库账号、不用申请、不会因为你没建数据库账号而卡住。
       这正是它绕开个人版限制的原因，也是 Day 17 能往下走的前提。
       （另两种：access_token 来自登录，2 小时有效；API Key 权限更大，
         官方明确说「不能暴露在前端」。云函数在后端，用哪个都安全，
         但 Publishable Key 最省事、不用处理过期，所以当默认值。）

   【这一版的代价，要说清楚】
       SQL 从「自己写 WHERE 子句」变成「用 PostgREST 的查询语法表达筛选」。
       语法不是 SQL：`date LIKE '2026-09%'` 要写成 `date=like.2026-09%`，
       `ORDER BY date DESC` 要写成 `order=date.desc`。
       改的是「怎么描述查询」，**不是「返回什么」**——
       对外的字段名、排序、错误码一个字没动（api-contract v1.4 已确认）。
   ============================================================ */

/* ------------------------------------------------------------
   环境变量（云开发控制台 → 云函数 → 函数详情 → 配置 → 环境变量）

   ┌────────────────┬──────────────────────────────────────────────┐
   │ 变量名│ 含义 / 去哪抄                                          │
   ├────────────────┼──────────────────────────────────────────────┤
   │ TCB_ENV        │ **环境 ID**。控制台首页左上角，或「环境设置」   │
   │                │ → 基础信息 → 环境 ID。形如 xxxxx-xxxxxxxx      │
   │                │ 拼进域名用：{TCB_ENV}.api.tcloudbasegateway.com │
   ├────────────────┼──────────────────────────────────────────────┤
   │ TCB_TOKEN      │ **【选填】访问令牌**。控制台 →「安全」→       │
   │                │ 「身份认证」→「访问令牌 / 令牌管理」里生成       │
   │                │ （Publishable Key / API Key 都行）              │
   │                │                                                │
   │                │ 不填也能跑：代码会自动走「匿名登录」换临时       │
   │                │ access_token（见第 3 段）。两条路都不需要       │
   │                │ 数据库密码。                                    │
   │                │                                                │
   │                │ ⚠️ 它是密钥，抄在纸上，不要写进代码、不要提交    │
   │                │    （AGENTS.md 第五节第 3 条）                  │
   └────────────────┴──────────────────────────────────────────────┘

   ⚠️ 不再需要 PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD —— 全部作废。
      代码里**一处process.env 也没有赋值**，全是读取（保持原样）。
   ------------------------------------------------------------ */

/** 启动期检查的结果。空字符串 = 没问题；非空 = 缺了什么。 */
const configError = process.env.TCB_ENV ? '' : '缺少环境变量 TCB_ENV';

/**
 * 单次请求超时（毫秒）。
 *
 * 为什么必须有：云函数默认超时往往几十秒到几分钟，不设超时的话，
 * 网关那边卡住（网络黑洞、连接池排队）会让函数**一直挂着**，
 * 平台会等到它自己超时才回收 —— 期间这次调用占着资源，
 * 而浏览器那边还在转圈。8 秒是我们能接受的上限：
 * 本地实测这个查询是毫秒级的，8 秒还回不来就是出问题了，早失败早重试。
 */
const REQUEST_TIMEOUT_MS = 8000;

/* ============================================================
   第 1 段 · 统一响应封装（照抄 health/index.js，行为保持一致）
   ============================================================ */

/**
 * 组装 CloudBase 认得的「集成响应」。
 *
 * 返回值里一旦出现 statusCode 字段，CloudBase 就不再自动包装，
 * 而是把 statusCode / headers / body 原样当HTTP 响应发出去。
 * 好处是状态码由我们说了算 —— 400 / 405 / 503 都靠它。
 *
 * 这个封装是从 functions/health/index.js 原样照抄的：
 * 同一个项目里两个云函数的响应格式必须一模一样，
 * 不然以后维护的人要同时记两套写法。
 *
 * @param {number} statusCode HTTP 状态码
 * @param {object} payload    要回给浏览器的数据（会被转成 JSON 文字）
 */
function json(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // 不缓存。这里比 health 更该不缓存：health 回的是一句「我还在」，
      // 而这个接口回的是**用户自己的账目**。让中间层缓存一次，
      // 就等于把别人的账目留在了别人的硬盘上。
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(payload)
  };
}

/* ============================================================
   第 2 段 · 成功 / 失败两种壳子
   ------------------------------------------------------------
   ⚠️ Day 17 拍板：响应统一套壳。
      契约第二节原来写的是「成功直接返回数据本体（不套外壳）」，
      今天改成统一 { ok, data } / { ok, data, error } 三字段形状。

      为什么现在改最便宜：全项目只有 1 个业务函数（health）需要跟着改，
      而第 3 周一共要写 8 个接口 —— 等写到第 5 个再换格式，
      前端已经按旧格式写了 4 处解析，全得回头改。
      「中途换格式最贵」是这次拍板的主要理由。
   ============================================================ */

/**
 * 组装成功响应。
 * @param {*} data 业务数据（本接口是数组）
 */
function ok(data) {
  return json(200, { ok: true, data: data });
}

/**
 * 组装失败响应。三个字段永远齐全，data 恒为 null ——
 * 前端只要判断 ok，不用再判断 data 存不存在。
 *
 * @param {number} statusCode HTTP 状态码
 * @param {string} code       错误码，取值见契约第二节的 code 表
 * @param {string} message    给用户看的中文说明
 * @param {string} [field]    出错的是哪个输入框（可选，前端拿它标红）
 */
function fail(statusCode, code, message, field) {
  const error = { code: code, message: message };
  if (field) {
    error.field = field;
  }
  return json(statusCode, { ok: false, data: null, error: error });
}

/* ============================================================
   第 3 段 · 令牌与 HTTP 访问层
   ------------------------------------------------------------
   这一段是「原来 require('pg') + new Pool(...)」那段的替代品。
   两者的职责完全对应：
     pg 的连接池 → 这里的「拼 URL + 发请求 + 拿 JSON」
     pg 的驱动   → 这里的全局 fetch（Node 18 自带，不用装依赖）
   ============================================================ */

/**
 * 运行时有没有 fetch。
 *
 * 为什么要专门查一次：官方云函数运行时是 Node 18，fetch 是自带的；
 * 但万一部署时选了更老的运行时（Node 16 就没有全局 fetch），
 * 直接调fetch 会抛「fetch is not defined」，报错难懂还看不出根因。
 * 提前查清楚，才能回一句人话。
 */
const hasFetch = typeof fetch === 'function';

/**
 * 匿名登录换来的临时令牌，缓存在内存里复用。
 *
 * 为什么缓存：access_token **2 小时就过期**，而云函数每次被调用
 * 可能是一个全新进程、也可能是复用同一个进程。
 *   · 每次请求都重新登录一次 → 多一次网络往返，慢且不礼貌；
 *   · 完全不缓存 → 2 小时后第一次请求必然401，然后又得重新登录。
 * 缓存 + 提前 60 秒失效，两头都躲开。
 */
let cachedToken = null;

/** HTTP 平台基础域名。见第 0 段引用的官方文档原文。 */
function baseUrl() {
  return 'https://' + process.env.TCB_ENV + '.api.tcloudbasegateway.com';
}

/**
 * 拼出一次查询的完整 URL。
 *
 * ⚠️⚠️ **这里是本文件最需要小心的地方：注入防护靠的就是这一层。**
 *
 * 原来用 pg 时，防注入靠的是「SQL 参数化」——用户传的值永远不进 SQL 文字，
 * 而是由驱动单独塞进去。改成 HTTP 之后**没有驱动替我们做这件事了**，
 * 筛选条件必须自己拼进 URL，所以「拼」这件事本身就有了注入风险。
 *
 * 现在的防线是**两层，缺一不可**：
 *
 *   第1 层 · 参数校验（main() 里的 MONTH_PATTERN / VALID_TYPES / parseLimit）
 *      month 只能是 `^\d{4}-(0[1-9]|1[0-2])$`，type 只能是「收入」「支出」，
 *      limit 被 parseLimit 收成 1~500 的整数。
 *      —— 也就是说，**能走到这里的值，形状已经被完全限定死了**。
 *
 *   第 2 层 · 每个键值都过 encodeURIComponent
 *      它会把 `&` `=` `?` `#` `/` 这些「能改变 URL 结构」的字符全部转义，
 *      所以就算第 1 层被绕过（比如将来有人放松了校验），
 *      用户输入也没法拼出额外的查询参数、更没法改URL 的结构。
 *      —— 这就是 HTTP 版本的「参数化」，对应 pg 的 `$1 $2`。
 *
 *   两层的分工和pg 那时一样：**第 1 层表达意图，第 2 层兜底安全**。
 *   ⚠️ 以后加新的查询参数时，第 2 层不能绕过 —— 一律走这个函数拼，不要自己拼字符串。
 *
 * @param {string} table   表名（必须在 public schema 下，官方文档明确只支持 public）
 * @param {Array<[string,string]>} pairs 有序的查询参数对
 * @returns {string} 完整 URL
 */
function restUrl(table, pairs) {
  const parts = [];
  for (let i = 0; i < pairs.length; i++) {
    parts.push(encodeURIComponent(pairs[i][0]) + '=' + encodeURIComponent(pairs[i][1]));
  }
  return baseUrl() + '/v1/rdb/rest/' + encodeURIComponent(table)
    + (parts.length > 0 ? '?' + parts.join('&') : '');
}

/**
 * 拿一个可用的访问令牌。
 *
 * 优先用 TCB_TOKEN（Publishable Key / API Key / 手工拿到的 access_token 都行）——
 * 它不会过期，最省事。
 * 没配就退回「匿名登录」现换一个 access_token，缓存在内存里。
 *
 * ⚠️ 两条路都**不需要数据库账号密码**，这是走 HTTP API 的关键好处。
 *
 * @returns {Promise<string>} 可放进 Authorization 头的令牌
 */
async function resolveToken() {
  // 走环境变量。注意：只读不写，值由控制台注入，代码里不赋值。
  const fixed = process.env.TCB_TOKEN;
  if (fixed) {
    return fixed;
  }

  // 缓存还有效就复用。留 60 秒余量：宁可早换一次，也别拿着
  // 「下一秒就要过期的令牌」去发请求。
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  // 匿名登录。官方文档给的原文是 POST {base}/auth/v1/signin/anonymously，body 为 {}
  const resp = await fetch(baseUrl() + '/auth/v1/signin/anonymously', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });

  if (!resp.ok) {
    const err = new Error('anonymous signin failed');
    err.dbStatus = resp.status;
    throw err;
  }

  const body = await resp.json();
  if (!body || typeof body.access_token !== 'string' || body.access_token === '') {
    const err = new Error('anonymous signin returned no token');
    err.dbStatus = resp.status;
    throw err;
  }

  // expires_in 单位是秒。缺这个字段就按 2 小时算（官方文档写的默认值），
  // 宁可提前失效也不能用过期令牌。
  const ttl = typeof body.expires_in === 'number' && body.expires_in > 0
    ? body.expires_in
    : 7200;
  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + (ttl - 60) * 1000
  };
  return cachedToken.token;
}

/**
 * 发一次 GET，把返回的 JSON 数组取回来。
 *
 * 失败时抛出的错误对象上带 `dbStatus`（网关的 HTTP 状态码），
 * 供调用方记日志用。**不带响应体**——原因见下面catch 里的说明。
 *
 * @param {string} url 由 restUrl() 拼好的完整 URL
 * @returns {Promise<Array<object>>} 返回的记录数组
 */
async function httpGetJson(url) {
  const token = await resolveToken();

  // AbortController + setTimeout = 手动实现超时。
  // fetch 自己不会超时，不设的话请求可能永远挂着（第 0 段的 REQUEST_TIMEOUT_MS）。
  // 关键：finally 里必须 clearTimeout，否则定时器会一直占着事件循环，
  // 云函数结束后不退出。
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  let resp;
  try {
    resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    /* --------------------------------------------------------
       ⚠️ 这里**故意不读、也不记响应体**。

       网关的报错正文里可能带着表结构、列名、内部标识，甚至
       认证失败的细节。把它写进日志或甩到浏览器上，等于泄露。
       所以只把「状态码」传出去，日志里也只记状态码。

       401 = 令牌无效/过期（检查 TCB_TOKEN 或匿名登录是否被关）
       403 = 权限不足（**最可能**：token 对应的角色没有这张表的 SELECT 权限，
             或表开了 RLS 但没给这个角色配 Policy —— schema.sql 第 3 节说过
             「开了 RLS 但没配 Policy = 默认全部拒绝」）
       404 = 表不存在 /路径不对（表必须在 public schema 下）
       400 = 查询语法不被接受（筛选或排序的写法有问题）
       -------------------------------------------------------- */
    const err = new Error('rdb rest request failed');
    err.dbStatus = resp.status;
    throw err;
  }

  const data = await resp.json();

  /* 官方文档原文：「当前数据返回都是以数组的形式返回」。
     保险起见还是查一下 —— 万一网关返回了别的东西（比如对象或空响应），
     带着这个错误进 catch，能回一句明确的 503，而不是让 .map 报
     「undefined is not a function」那种看不懂的错。 */
  if (!Array.isArray(data)) {
    const err = new Error('unexpected response shape');
    err.dbStatus = resp.status;
    throw err;
  }

  return data;
}

/* ============================================================
   第 4 段 · 参数校验
   ============================================================ */

/** type 的合法取值。只有这两个，别的全部 400（契约第二节 + 第五节第 2 条）。 */
const VALID_TYPES = ['收入', '支出'];

/**
 * month 的格式：4 位年 - 2 位月，且月份必须在 01~12。
 *
 * 为什么不用宽松的 /^\d{4}-\d{2}$/：那样 '2026-13'、'2026-00' 会混过去。
 * 13 月不是日期，进了查询就变成一条谁也读不到的记录 ——
 * 前端会看到「这个月 0 笔账」，用户以为记账丢了。
 * 参数错误要在门口就拦住，不能带着坏数据去查数据库。
 *
 * ⚠️ 这个正则现在是**注入防护的第一层**（见 restUrl() 的说明），
 *    放宽它之前先想清楚后果。
 */
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** limit 的默认值（契约第五节第 2 条：默认 200，今天不分页）。 */
const DEFAULT_LIMIT = 200;

/**
 * limit 的上限。
 *
 * 为什么加个上限：契约没写，但不加的话?limit=99999999 就等于
 * 「把整张表一次搬给浏览器」。个人记账数据量小，可一旦数据长起来
 * 第一个爆的是浏览器的内存。先在代码里压住，比出事故再补便宜。
 */
const MAX_LIMIT = 500;

/**
 * 解析 limit。
 *
 * ⚠️ 注意这里返回 400 吗？**不返回**。
 *    契约第五节第 2 条的错误表只列了 month 和 type 两种 400，
 *    没有 limit —— 契约没写的状态码我不自己发明（前端没按它写过分支）。
 *    传了乱七八糟的值（比如 limit=abc、limit=-5）就退回默认值 200。
 *    「传错参数 → 用默认值继续服务」对读接口来说是合理的宽容。
 *
 * @param {string|undefined} raw query 里的 limit 原文
 * @returns {number} 1~MAX_LIMIT 之间的整数
 */
function parseLimit(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(n, MAX_LIMIT);
}

/* ============================================================
   第 5 段 · 数据库行 → 前端对象
   ============================================================ */

/**
 * 把一行记录翻译成前端认识的字段名和类型。
 *
 * 这里干了两件前端看不见、但不做就一定出错的事：
 *
 * ① 字段改名：数据库是 created_at / updated_at（下划线），
 *    前端是 createdAt / updatedAt（驼峰）。
 *    契约第二节写死「字段名一律照 TECH_DESIGN，不改名」——
 *    指的是**对外的字段名**不改，而对外的形状由契约第五节规定是驼峰。
 *    数据库的列名怎么写是数据库自己的事，接口层负责翻译。
 *
 * ② amount 必须 Number()。
 *    amount 在数据库里是 numeric(12,2)（精确小数，避免浮点误差）。
 *    经过 HTTP API 回来时，它**可能是 JSON 数字 38.5，
 *    也可能是字符串 "38.50"** —— 取决于网关把numeric 序列化成什么。
 *    Number() 对这两种输入都给出同一个结果（38.5），
 *    所以这一行**不管哪种情况都正确**，不用改。
 *
 *    为什么必须转：万一拿到的是字符串，"38.50" + 0 会拼成 "38.500"，
 *    算账直接错—— 而且错得很安静，界面上看不出来。
 *    schema.sql 第 2.3 节末尾也提前打过这个招呼。
 *
 *    📌 待实测确认：本地只能验证「传字符串时行为正确」；
 *       CloudBase 网关实际返回数字还是字符串，须在部署后按
 *       DEPLOY.md 五-3 验证点 2 核对一次。无论哪种，本行都成立。
 *
 * @param {object} row 一行记录（键名与数据库列名一致）
 * @returns {object} 前端要的对象
 */
function toFrontend(row) {
  return {
    id: row.id,
    date: row.date,
    // NOT NULL + CHECK(amount > 0)，不会是 null，Number() 一定转得出来
    amount: Number(row.amount),
    type: row.type,
    category: row.category,
    // note 允许为 NULL。前端抽屉是按文字读的，直接给 null 会显示「null」。
    // 空备注显示成空白才对，所以把 null 收成空字符串。
    // （只收 note —— profile 里的 name/contact 等按契约保持 null，别学错了）
    note: row.note === null || row.note === undefined ? '' : row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/* ============================================================
   第 6 段 · 查数据库
   ============================================================ */

/**
 * 组装并执行这次查询。
 *
 * ⚠️⚠️ 本函数最要紧的一条纪律：**用户输入绝不裸拼进查询条件**。
 *
 * 原来是 pg 的 SQL 参数化（`date LIKE $1`），现在换成 PostgREST 语法，
 * 纪律没变、只是换了个实现方式（详见 restUrl() 里的两层防线说明）：
 *   month / type / limit 都在 main() 里被校验成确定的形状，
 *   再由 restUrl() 逐个 encodeURIComponent，绝不直接拼进 URL 文字。
 *
 * 【筛选 / 排序的语法对照】左边是原来的 SQL，右边是 HTTP API 的写法，
 *   依据是官方文档「PostgreSQL 数据库的 HTTP API 基于 PostgREST 协议」
 *   与文档里的操作符表、排序分页示例：
 *
 *   SQL                                   →  PostgREST 查询串
 *   ─────────────────────────────────────────────────────────
 *   WHERE date LIKE '2026-09%'            →  date=like.2026-09%   ← ⚠️ 见下
 *   WHERE type = '支出'                    →  type=eq.支出
 *   ORDER BY date DESC, created_at DESC   →  order=date.desc,created_at.desc
 *   LIMIT 200                             →  limit=200
 *   SELECT id, date, amount, ...          →  select=id,date,amount,...
 *
 * 【⚠️ text 字段的前缀匹配：通配符是 %，不是 *】
 *   文档操作符表原文：`like` 模糊匹配 `?name=like.%value%`
 *   —— 用的就是 SQL 的 `%`，**不是** PostgREST 某些方言里的 `*`。
 *   所以「9 月」写成 `date=like.2026-09%`。
 *
 *   为什么 LIKE 前缀能用（而不只是「能跑」）：
 *     date 是 'YYYY-MM-DD'，固定 7 位，字典序正好等于时间序。
 *     所以 '2026-09-xx' 开头 = 9 月。索引 idx_expenses_date 也建在 date 上。
 *
 *   📌 待实测确认：% 经encodeURIComponent 会变成 %25，
 *      网关解码后应当还原成 LIKE 的通配符。这条**必须在部署后真跑一次**
 *      （DEPLOY.md 五-3验证点 4：?month=2026-09 应返回 5 条）。
 *      本地只能验证「我们发出去的 URL 长这样」，无法验证网关认不认。
 *
 *   （留个余力优化：将来数据量大了，可以改成
 *     date=gte.2026-09-01 & date=lt.2026-10-01 的范围查询，那样更能吃满索引。）
 *
 * 【为什么 select 要写死列名】
 *   不用 select *：
 *     ① 契约第五节规定了对外字段名，不能让数据库多返回什么就漏出去什么；
 *     ② select * 在别人改了表结构后会静默变形，bug 极难查。
 *
 * @param {object} query 经过校验的查询条件
 * @returns {Promise<Array<object>>} 前端形状的记录数组
 */
async function queryExpenses(query) {
  const params = [];

  params.push([
    'select',
    'id,date,amount,type,category,note,created_at,updated_at'
  ]);

  if (query.month !== null) {
    // like + 前缀通配符 %，转义由 restUrl() 统一负责（% → %25）
    params.push(['date', 'like.' + query.month + '%']);
  }

  if (query.type !== null) {
    // eq.收入 / eq.支出。中文经 encodeURIComponent 变成 %XX 形式，
    // 网关会解码回中文，数据库那边收到的仍是 '收入' / '支出'。
    params.push(['type', 'eq.' + query.type]);
  }

  // 排序：date 从晚到早；同一天按 created_at 从晚到早（契约第五节第 2 条）。
  // 这就是 idx_expenses_date 索引建的顺序（schema.sql 第 1-1 节末尾），
  // 索引不是随手加的，是照这条排序规则对出来的。
  params.push(['order', 'date.desc,created_at.desc']);

  params.push(['limit', String(query.limit)]);

  const rows = await httpGetJson(restUrl('expenses', params));
  return rows.map(toFrontend);
}

/* ============================================================
   第 7 段 · 云函数入口
   ============================================================ */

/**
 * CloudBase 会自动调用它，把返回值当响应发回浏览器。
 *
 * @param event   这次 HTTP 请求的信息。经「HTTP 访问服务」访问时有
 *                httpMethod / queryStringParameters 等字段
 * @param context 本次调用的运行信息（今天用不到）
 */
exports.main = async (event, context) => {
  const method = (event && event.httpMethod) || 'GET';

  // 今天只认 GET。POST / PUT / DELETE 是Day 18 的活。
  // 别的方法一律拒掉，而不是「也回一句 ok」—— 回了就是假话。
  if (method !== 'GET') {
    return fail(405, 'method_not_allowed', '这个接口只支持 GET（写入接口等Day 18）');
  }

  // queryStringParameters 在没有任何查询参数时可能是 null，
  // 所以给个空对象兜住，免得后面读属性报错。
  const raw = (event && event.queryStringParameters) || {};
  const rawMonth = raw.month;
  const rawType = raw.type;

  /* ---- 参数校验：错了就在门口400，不带着坏数据去查数据库 ---- */

  // month：空字符串按「不筛选」处理。
  // 为什么空串不算错：前端用 URLSearchParams 拼地址时，
  // 「这个月不筛选」很容易拼成 ?month=（值是空）。这时候回 400
  // 会让「不筛选」变成「报错」，反而是帮倒忙。真正传了乱填才拦。
  let month = null;
  if (rawMonth !== undefined && rawMonth !== null && rawMonth !== '') {
    if (!MONTH_PATTERN.test(rawMonth)) {
      return fail(400, 'bad_request', 'month 格式必须是 YYYY-MM，例如 2026-09', 'month');
    }
    month = rawMonth;
  }

  // type：非空就必须在枚举里。分类与type 的对应关系由数据库 CHECK 兜着，
  // 这里只管住 type 本身这一个字段（完整校验是 Day 18 写接口的事）。
  let type = null;
  if (rawType !== undefined && rawType !== null && rawType !== '') {
    if (VALID_TYPES.indexOf(rawType) === -1) {
      return fail(400, 'bad_request', 'type 只能是「收入」或「支出」', 'type');
    }
    type = rawType;
  }

  const limit = parseLimit(raw.limit);

  /* ---- 真正去查数据库 ---- */

  // 环境变量没配 / 运行时没有 fetch：也是 503。用同一个 code，
  // 前端只需要处理一种「稍后重试」。
  if (configError !== '' || !hasFetch) {
    console.error('[expenses] 运行配置缺失：'
      + (configError !== '' ? configError : '运行时不支持 fetch，请确认使用 Node.js 18 及以上'));
    return fail(503, 'service_unavailable', '数据库暂时连不上，稍后重试');
  }

  try {
    const rows = await queryExpenses({ month: month, type: type, limit: limit });
    return ok(rows);
  } catch (err) {
    /* --------------------------------------------------------
       网关报错（401 认证/ 403 权限 / 404 表不存在 / 400 语法）、
       网络超时、令牌换不到，都走到这里。

       为什么不把错误详情原样回给浏览器：
         网关的响应体里可能带**表结构、列名、内部标识**。
         把它甩到浏览器上，等于把数据库结构公开给任何访问这个接口的人
         —— 这是信息泄露，不是「方便排查」。
         所以这里只回一句人话，真实原因留在服务端日志里。

       日志里也只记状态码（err.dbStatus），
       不记响应体、不记 err.message —— 后者同样可能带地址或结构信息。
       状态码足够定位问题，又不会泄密。
       -------------------------------------------------------- */
    console.error('[expenses] 查询失败，网关状态码：'
      + (err && err.dbStatus ? err.dbStatus : '无响应或超时'));
    return fail(503, 'service_unavailable', '数据库暂时连不上，稍后重试');
  }
};

/* ----
   下面是本文件依赖契约的逐条对照，写完顺手核一遍，
   免得后面契约改了、代码忘了跟：

   契约第二节 · 通用约定
     · 字段名对外不改编 → toFrontend() 只做 created_at→createdAt 这类**对齐**，
       不新增、不删字段（id/date/amount/type/category/note 一个不少）
     · 日期是文本 YYYY-MM-DD → 直接透传，不转成JS Date 对象
       （转了就变成带时区的 Date，前端的字符串比较全废）
     · 金额是数字、正数→ Number() 转换，见 toFrontend() ②
     · type 是中文 → 查询条件里的 type=eq.收入 / eq.支出 就是中文本身

   契约第五节第 2 条
     · month / type / limit 三个查询参数，全可选 ✓
     · limit 默认 200 ✓
     · 不传 month = 全部月份 ✓（month 为 null 时不加这个条件）
     · 排序 date DESC, created_at DESC ✓（order=date.desc,created_at.desc）
     · 成功 200 { ok:true, data:[...] } ✓
     · 400 month 格式错（带 field）✓
     · 400 type 不在枚举（带 field）✓
     · 405 非GET ✓
     · 503 数据库不可用 ✓（配置缺失 / 认证失败 / 权限不足 / 超时，都归它）

   ⚠️ 改造前后**对外行为零变化**：
     入参、字段名、排序规则、状态码、错误码、错误体形状、503 不回传原始报错
     —— 全部逐字未动。变的只有「怎么把数据取回来」这一层。
     api-contract.md v1.4 已在第二节补记这次部署路径调整。
---- */
