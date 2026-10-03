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
   第 2 段之二 · 503 失败原因分档
   ------------------------------------------------------------
   为什么要加这一段：以前 503 永远是固定的一句「数据库暂时连不上，稍后重试」。
   部署当天真的连不上时，这句话**不包含任何信息**——
   到底是令牌没配、令牌无效、权限不够、表不存在、还是网络出不去，
   全都长一模一样，只能靠人一次次猜。

   这一段把原因**分档**，拼到那句话后面。

   ⚠️ 三条铁律（写之前先想清楚，忘了就是安全事故）：
     ① 状态码可以带出去 —— 401 / 403 / 404 / 400 是公开的 HTTP 语义，
        任何人都能从自己机器上拿到，不构成泄露。
     ② **绝不带**：令牌原文或片段、数据库密码、host:port、内网 IP、
        响应体正文、表结构与列名。带出去任何一项都是把内部信息
        甩给任何一个能访问这个接口的人。
     ③ 前端只需要知道「稍后重试」——多出来的这段是给**日志和截图**看的，
        不参与前端逻辑判断（前端分支只认 error.code，那是契约规定的）。

   这一段不是临时的，它不依赖诊断入口，可以长期留着。
   ============================================================ */

/** 503 的那句固定前缀。**只改后半段，前面一个字都不动**，前端文案不变。 */
const UNAVAILABLE_PREFIX = '数据库暂时连不上，稍后重试';

/**
 * 把失败原因翻译成一句可以安全外发的话。
 *
 * @param {string} reason 分档代码，见下面的 translateReason()
 * @returns {string} 完整的中文说明，形如「……（网关返回 403，权限不足）」
 */
function unavailableMessage(reason) {
  return reason === '' ? UNAVAILABLE_PREFIX : UNAVAILABLE_PREFIX + '（' + reason + '）';
}

/**
 * 把一个失败翻译成「分档代码」。
 *
 * ⚠️ 这里**只做翻译，不发任何请求**。真正的诊断（真的打一次网关看状态码）
 *    在第 7 段之二的诊断入口里。两者刻意分开：
 *    正式路径不该为了「给出原因」多打一次请求，
 *    而诊断入口是临时的、只在排查时才走。
 *
 * @param {object} err catch 到的错误对象（可能带 dbStatus）
 * @returns {string} 分档代码；'' 表示原因不明
 */
function translateReason(err) {
  // 缺 TCB_ENV：连 URL 都拼不出来，根本没发出去过。
  if (configError !== '') {
    return '服务配置不完整';
  }
  if (!hasFetch) {
    return '服务配置不完整';
  }

  const status = err && err.dbStatus ? err.dbStatus : 0;

  if (status === 401) {
    return '网关返回 401，令牌无效';
  }
  if (status === 403) {
    return '网关返回 403，权限不足';
  }
  if (status === 404) {
    return '网关返回 404，表或路径不存在';
  }
  if (status === 400) {
    return '网关返回 400，查询语法不被接受';
  }
  if (status >= 500) {
    return '网关返回 ' + status + '，数据库服务异常';
  }

  // 没有状态码 = 没收到 HTTP 响应。区分两种：
  //   AbortError = 我们自己的 8秒超时打上来的（REQUEST_TIMEOUT_MS）
  //   其它（TypeError: fetch failed 等）= DNS 解析失败 / 出网被拦 / 连不上
  const name = err && err.name ? err.name : '';
  if (name === 'AbortError') {
    return '连不上数据库网络';
  }
  if (status === 0) {
    return '连不上数据库网络';
  }
  return '网关返回 ' + status;
}

/* ============================================================
   第 3 段 · 令牌与 HTTP 访问层
   ------------------------------------------------------------
   这一段是「原来 require('pg') + new Pool(...)」那段的替代品。
   两者的职责完全对应：
     pg 的连接池 → 这里的「拼 URL + 发请求 + 拿 JSON」
     pg 的驱动   → 这里的全局 fetch（Node 18 自带，不用装依赖）

   ⚠️ 临时排查入口（Day 17 · 定位 503 用，定位后可整块删除）
      见下面「第 3 段之二 · 诊断」。诊断整块由
      「↓↓ DIAG-BEGIN」与「↑↑ DIAG-END」两个标记包住，
      删掉这两行之间的内容、再把 main() 里 __diag 那 3 行删掉，
      就完全回到今天上线的样子，不留任何残留。
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
  /* ------------------------------------------------------------
     令牌来源，按优先级依次尝试（Day 17 踩坑后加的第2、3 档）：

       ① `TCB_API_KEY` 或 `CLOUDBASE_APIKEY` —— **官方推荐做法**
          API Key 带 service_role 权限，是 CloudBase 专门为「云函数/云托管
          服务端调数据库」准备的方式（官方文档：初始化云开发资源 →
          「在函数环境变量中配置 CLOUDBASE_APIKEY」）。
          **为什么优先用它**：API Key 比 Publishable Key 短得多
          （Publishable Key 是一千多字符的 JWT，在控制台输入框里容易被截断 ——
          实测就是这么翻车的：云函数里拿到的长度只有 1107，真实值是 1166，
          少了 59 个字符，网关直接回 401）。短 = 不易被截断 = 更稳。

       ② `TCB_TOKEN` —— Publishable Key / access_token 也能用，
          但同样有「长字符串被截断」的风险。

       ③ 匿名登录换access_token —— 最后兜底。
          ⚠️ 实测在**个人版**环境这条路走不通：
          匿名登录端点要求请求头带 `x-device-id`（不是文档里的其它名字），
          带上之后返回 `LOGIN_TYPE_DISABLED / 请联系开发者在身份源列表开启匿名登录`。
          也就是说个人版默认不开匿名登录。留着这段是为了将来开了之后能用。

     ⚠️ 无论哪一档，**这里只读不写**（AGENTS.md 第五节第 3 条：密钥不进代码不进提交）。
        值一律由控制台注入。
     ------------------------------------------------------------ */

  // 第 ① 档：API Key（官方推荐，短，不易被截断）
  const apiKey = process.env.CLOUDBASE_APIKEY || process.env.TCB_API_KEY;
  if (apiKey) {
    return apiKey;
  }

  // 第 ② 档：Publishable Key / 手工拿到的 access_token
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

  // 第 ③ 档：匿名登录。官方文档给的原文是 POST {base}/auth/v1/signin/anonymously，body 为 {}
  //⚠️ 个人版实测不通（见上），但保留以备将来开通。
  const resp = await fetch(baseUrl() + '/auth/v1/signin/anonymously', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-device-id': 'jiance-server' },
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
 * 把一个错误对象里**真正有信息量的那层**掏出来。
 *
 * ⚠️⚠️ 这一条是实测踩出来的，写在这里免得以后当 bug 改掉：
 *
 *   Node 18+ 的 fetch（底层是 undici）在网络失败时抛的是
 *   `TypeError: fetch failed` —— **message 只有这四个字母**，
 *   真正的原因（DNS 解析不了？连接被拒？超时？）被塞在 `err.cause` 里：
 *       err.cause.code    = 'ENOTFOUND'
 *       err.cause.message = 'getaddrinfo ENOTFOUND xxx.api.tcloudbasegateway.com'
 *
 *   只看 err.message 的话，DNS 失败、连接被拒、证书出错、超时
 *   **全都是同一句 "fetch failed"** —— 四个完全不同的根因长得一模一样，
 *   诊断就白加了。本地实测确认过：只取 message 时
 *   probeErrorMessageSanitized 就是干巴巴一句 "fetch failed"，
 *   加上这一层之后才看得到 ENOTFOUND。
 *
 * @param {*} err 捕获到的错误
 * @returns {string} 拼好的信息串（cause.code 在前，其后 message 与 cause.message）
 */
function describeErrorDeeply(err) {
  if (!err) {
    return '';
  }
  let text = err.message ? String(err.message) : String(err);

  // cause 可能是 Error，也可能是 AggregateError（多个候选地址同时失败）
  const cause = err.cause;
  if (cause) {
    if (cause.code) {
      // code 放最前面：ENOTFOUND / ECONNREFUSED / ETIMEDOUT / CERT_HAS_EXPIRED
      // 这些词是定性判断的关键，必须第一眼看到
      text = cause.code + ': ' + text;
    }
    if (cause.message && cause.message !== text) {
      text = text + ' <- ' + cause.message;
    }
    // AggregateError.errors 数组：把每一条的 code 也带上
    if (Array.isArray(cause.errors)) {
      for (let i = 0; i < cause.errors.length; i++) {
        const sub = cause.errors[i];
        if (sub && sub.code) {
          text += ' [' + sub.code + ']';
        }
      }
    }
  }
  return text;
}

/**
 * 发一次 GET，**只负责把结果如实描述出来，不做任何判断**。
 *
 * ⚠️ 为什么要有这一层：临时诊断需要一个「和正式路径**完全一样**」的探测，
 *    而正式路径的 httpGetJson() 一拿到非 2xx 就抛异常，把状态码塞进
 *    err.dbStatus 里就断了 —— 诊断拿不到「原始状态码」这个关键数据。
 *    如果诊断另写一份 fetch，两份代码就会各自漂移，测出来的 probeStatus
 *    不能代表正式路径的真实情况，诊断本身就失去意义。
 *    所以把「发请求」这一层抽出来共用，判断留给调用方。
 *
 * 这一步是**纯提取、不改行为**：原来 httpGetJson 里的
 * 「取令牌 → 起 AbortController → fetch → clearTimeout」原封不动搬进来，
 * 成功/失败的判定全部留给 httpGetJson，抛错位置和 err.dbStatus 一字未变。
 *
 * @param {string} url 完整 URL（由 restUrl 拼好）
 * @returns {Promise<object>} 结构化结果，**永远 resolve，不 reject**：
 *   {
 *     reached:  true/false   —— 是否真的收到了 HTTP 响应
 *     status:   number|null  —— HTTP 状态码；没收到响应为 null
 *     json:     any          —— 解析后的响应体（仅 reached 且 2xx 时有效）
 *     errorName:string|null  —— 失败时 err.name（如 TypeError / AbortError）
 *     errorMessage: string   —— 失败时的错误信息原文（**由调用方脱敏**），
 *                              已用 describeErrorDeeply 把 cause 那层拼进来，
 *                              否则 DNS 失败只会显示一句没用的 "fetch failed"
 *     elapsedMs:number       —— 本次请求耗时
 *     elapsedMs:number       —— 本次请求耗时
 *   }
 */
async function sendGet(url) {
  const startedAt = Date.now();

  let token;
  try {
    token = await resolveToken();
  } catch (err) {
    // 令牌换不到（匿名登录失败 / 网络不通）也算一次「没打出去」。
    // 这里必须 catch：否则诊断入口自己会跟着炸，等于白加。
    return {
      reached: false,
      status: err && err.dbStatus ? err.dbStatus : null,
      json: undefined,
      errorName: err && err.name ? err.name : 'Error',
      errorMessage: describeErrorDeeply(err),
      elapsedMs: Date.now() - startedAt
    };
  }

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
  } catch (err) {
    // 网络层失败：DNS 解析不了、连不上、超时被 abort、被出网策略拦……
    // 全在这一支。err.message 里有我们需要的关键信息
    // （比如 getaddrinfo ENOTFOUND / ECONNREFUSED），
    // 但它**可能带域名和 IP**，所以只交原文给调用方，由调用方脱敏后再输出。
    return {
      reached: false,
      status: null,
      json: undefined,
      errorName: err && err.name ? err.name : 'Error',
      errorMessage: describeErrorDeeply(err),
      elapsedMs: Date.now() - startedAt
    };
  } finally {
    clearTimeout(timer);
  }

  // 收到响应了。**刻意不读、也不返回响应体**（非 2xx 时）——
  // 原因见下面 httpGetJson 里那段说明：网关的报错正文里可能带表结构、
  // 列名、内部标识，甚至认证细节，泄露出去等于把数据库结构公开。
  if (!resp.ok) {
    return {
      reached: true,
      status: resp.status,
      json: undefined,
      errorName: null,
      errorMessage: '',
      elapsedMs: Date.now() - startedAt
    };
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    return {
      reached: true,
      status: resp.status,
      json: undefined,
      errorName: err && err.name ? err.name : 'Error',
      errorMessage: describeErrorDeeply(err),
      elapsedMs: Date.now() - startedAt
    };
  }

  return {
    reached: true,
    status: resp.status,
    json: data,
    errorName: null,
    errorMessage: '',
    elapsedMs: Date.now() - startedAt
  };
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
  const res = await sendGet(url);

  if (!res.reached) {
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
    err.dbStatus = res.status;
    throw err;
  }

  const data = res.json;

  /* 官方文档原文：「当前数据返回都是以数组的形式返回」。
     保险起见还是查一下 —— 万一网关返回了别的东西（比如对象、空响应、
     甚至一段不是 JSON 的文字），带着这个错误进 catch，能回一句明确的 503，
     而不是让 .map 报「undefined is not a function」那种看不懂的错。
     （正文解析失败时 errorName 非空，也归到这里，状态码照样带上。） */
  if (res.errorName !== null || !Array.isArray(data)) {
    const err = new Error('unexpected response shape');
    err.dbStatus = res.status;
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
   ↓↓↓ DIAG-BEGIN · Day 17 临时诊断入口（定位后可整块删除）
   ------------------------------------------------------------
   ⚠️⚠️ **这是 Day 17 临时排查入口，定位完成后即可移除。**
   它不属于 api-contract.md 的正式接口，是排查 503 时临时加的探针。
   契约里没有登记它，前端也不会调它。

   用法：GET /api/expenses?__diag=1
   （用双下划线前缀是为了不和真实参数 month / type / limit 混淆；
     真实参数三个都不长这样，__diag 永远不会和它们撞名。）

   【要解决什么问题】
   部署后公网接口一律 503，但同域名的 /api/health 正常 ——
   说明函数在跑、代码在跑，503 是我们自己回的。
   而同一个 Publishable Key 从本机直连网关是通的，
   所以网关、令牌、表数据都是好的，问题只发生在**云函数内部**。
   可能性有五六种（环境变量没保存 / 出网被拦 / DNS 不通 / 运行时不对…），
   靠猜是猜不出来的，**必须拿到运行时真相**。

   【设计上怎么做到能干净摘掉】
   · 全部代码集中在下方两个标记之间，删掉即可，不散落在别处
   · 唯一侵入正式路径的是 main() 开头的 3 行（一个 if + 一个 return）
     ——没有 __diag 时，那 3 行不改变任何行为
   · 复用正式路径的 sendGet()（同一个 fetch、同一套头、同一个超时），
     不是另写一份 —— 另写一份的话，测出来的结果不能代表正式路径
   · 不依赖任何新依赖、不改 package.json

   ⚠️【安全红线 · 每一条都在下面代码里落实了】
   · TCB_TOKEN 只回「有没有」和「多长」，**绝不回值、绝不回片段**
   · 环境变量只回**名字**，不回值（名字本身不敏感，值敏感）
   · 探测请求真的发出去，但**只读状态码，不读响应体**
   · 错误 message 过一遍脱敏：IP / 域名 / 端口 / Bearer 后那串 / 任何长串
     全部替换成 ***
   · 探测用的是**只取 1 行的 select**，诊断输出里不会有任何真实业务数据
   · 诊断本身不打印令牌、不打印查询结果
   ============================================================ */

/**
 * 脱敏：把错误 message 里可能带连接细节的部分替换成 ***。
 *
 * ⚠️ 为什么不能直接返回 err.message 原文：
 *    Node 的网络错误长这样 ——
 *      · DNS 失败：getaddrinfo ENOTFOUND xxx.api.tcloudbasegateway.com
 *      · 连不上：connect ECONNREFUSED 10.0.0.5:5432
 *      · 证书问题：unable to verify... hostname: xxx.api.tcloudbasegateway.com
 *    这些字符串里带着**内网地址、端口、我们的域名**。
 *    而这个诊断入口是公网可访问的，原文回出去等于把内部拓扑送上门。
 *
 *    但**完全不能回**也不行 —— 「ENOTFOUND」和「ECONNREFUSED」和
 *    「ETIMEDOUT」这三个词恰恰是定性的关键：
 *      ENOTFOUND    → DNS 解析不了（出网被拦 / 域名不对）
 *      ECONNREFUSED → 域名解析了但连不上（安全组 / 出网策略）
 *      ETIMEDOUT    → 出去的路是黑的（黑洞）
 *    所以做法是：**只保留这些「诊断词」，其余能定位到机器/网络的一律打码**。
 *
 * 规则（按顺序执行，先长后短，避免打码不彻底）：
 *   ① Bearer 后面那串      → ***
 *   ② 任何长度 > 40 的连续串 → ***（令牌、签名、路径片段）
 *   ③ IPv4:端口            → ***
 *   ④ 带点的域名           → ***
 *   ⑤ 单独的数字串         → ***（端口）
 *
 * @param {string} text 原始错误信息
 * @returns {string} 脱敏后的信息（只保留错误类别词，长度收窄）
 */
function sanitizeErrorMessage(text) {
  if (typeof text !== 'string' || text === '') {
    return '';
  }
  let out = text;

  // ① Authorization: Bearer xxxxx —— 先处理这个，不然后面的长串规则会漏掉
  out = out.replace(/Bearer\s+\S+/gi, 'Bearer ***');

  // ④ 域名（含子域、含端口）。注意要放在 ③ 前面，
  //    否则 xxx.api.tcloudbasegateway.com:443 里的域名会被 ③ 拆错。
  out = out.replace(/[A-Za-z0-9][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+(:\d+)?/g, '***');

  // ③ IPv4（可带端口）
  out = out.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?/g, '***');

  // ① 的补漏：有些库会写成 "Authorization: <token>"（不带 Bearer 字样）
  //    这里靠 ② 的长串规则兜底。

  // ② 任何长串 —— 令牌 / 签名 / 内部路径。这是最后一道网，
  //    上面所有规则漏掉的，只要超过 40 个字符就一定被打掉。
  out = out.replace(/[A-Za-z0-9_\-./+=]{41,}/g, '***');

  // ⑤ 剩下的独立数字（端口号、错误码数字）也一并打掉。
  //    ⚠️ 刻意**保留** 这些词，它们是定性关键：
  //      ENOTFOUND / ECONNREFUSED / ETIMEDOUT / EPERM / EAI_AGAIN
  //      fetch failed / network timeout / aborted
  out = out.replace(/(?<![\w.:])\d{2,5}(?![\w.])/g, '***');

  // 收窄长度：万一将来出现没被上面规则覆盖的新型长串，
  // 至少不会一口气吐出几百字。截断处标出来，让人知道被截了。
  if (out.length > 200) {
    out = out.slice(0, 200) + '…(已截断)';
  }
  return out;
}

/**
 * 列出 CloudBase 注入的环境变量**名字**（不含值）。
 *
 * ⚠️ 为什么这一项价值最高：
 *    它能一眼看出两件事 ——
 *      ① 平台到底注入了什么（SCF_NAMESPACE / TCB_ENV / TENCENTCLOUD_* 之类）
 *      ② **我们配的 TCB_ENV 和平台自己注入的同名变量是不是打架了**
 *        —— 如果两边都有 TCB_ENV 而值不一样，命令行注入通常会覆盖代码，
 *          这正是「环境变量明明填了却不生效」最常见的一种成因。
 *
 * 只列名字不列值：变量名不敏感，值敏感。
 * 这是一次**真实**的枚举 —— 诊断要的是运行时真相，
 * 写死几个名字回显等于什么都没查。
 *
 * @returns {string[]} 排序后的变量名数组
 */
function listInjectedEnvNames() {
  const names = Object.keys(process.env).filter(function (name) {
    // 过滤掉明显是我们自己测试塞进去的，以及太长/含怪字符的
    // （环境变量名按规范只可能是字母数字下划线，不合规的说明是平台内部用的）
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && name.length <= 64;
  });
  names.sort();
  return names;
}

/**
 * 组装诊断结果。
 *
 * ⚠️ 关键：**真的发一次请求**，用和正式路径完全相同的 sendGet()。
 *    写成静态配置回显是没用的 —— 我们要的是「此刻真的能不能出去」。
 *
 * 探测用 `select=id&limit=1`：只取主键、只取 1 行。
 *   · 够用来判断「能不能出去、令牌认不认、权限够不够」
 *   · 不会把任何真实业务数据带进诊断输出（安全红线）
 *
 * @returns {Promise<object>} 诊断结果对象
 */
async function buildDiag() {
  const token = process.env.TCB_TOKEN;

  const report = {
    // —— 配置类：只回「有没有」和「多长」，绝不回值 ——
    hasTCBEnv: Boolean(process.env.TCB_ENV),
    hasTCBToken: Boolean(token),
    // 只回长度。用途：发现「控制台保存时被截断」——
    // 令牌明明存在、长度却明显偏短，指向保存环节出了问题。
    // 长度本身推不出任何密钥内容。
    tcbTokenLength: typeof token === 'string' ? token.length : 0,

    // —— 运行时类——
    nodeVersion: process.version,
    hasFetch: hasFetch,

    // —— 环境类：只列名字——
    cloudbaseInjected: listInjectedEnvNames(),

    // —— 探测类：下面真的发一次请求填 ——
    // probeUrl 只到「域名 + 路径」，不带任何查询参数：
    // select= 里是列名、date= 里是用户可能传的值，都不关我们的事。
    // TCB_ENV 没配时不要把字符串 "undefined" 拼进域名 ——
    // 那样看起来像「域名拼错了」，而真实原因是「压根没配」，两回事。
    probeUrl: process.env.TCB_ENV
      ? baseUrl() + '/v1/rdb/rest/expenses'
      : '(未配置 TCB_ENV，无法拼出域名)',
    probeStatus: null,
    probeErrorName: null,
    probeErrorMessageSanitized: '',
    elapsedMs: 0
  };

  // 配置不全或运行时不支持 fetch：根本发不出请求，如实说清楚，不假装。
  if (configError !== '' || !hasFetch) {
    report.probeStatus = 'skipped';
    report.probeErrorName = configError !== '' ? 'ConfigError' : 'NoFetchError';
    report.probeErrorMessageSanitized = configError !== ''
      ? configError
      : '运行时不支持 fetch';
    return report;
  }

  // ⚠️ 用 select=id&limit=1 —— 只探连通性与认证，不带任何真实数据。
  // restUrl 负责 encodeURIComponent，和正式路径同一套拼装逻辑。
  const probeUrl = restUrl('expenses', [['select', 'id'], ['limit', '1']]);
  const res = await sendGet(probeUrl);

  report.elapsedMs = res.elapsedMs;
  if (res.reached) {
    // 真的收到了 HTTP 响应。状态码就是全部答案。
    report.probeStatus = res.status;
    if (res.errorName !== null) {
      // 收到了响应但正文不是合法 JSON：状态码正常，数据却拿不了。
      report.probeErrorName = res.errorName;
      report.probeErrorMessageSanitized = sanitizeErrorMessage(res.errorMessage);
    }
  } else {
    // 没收到响应：DNS / 出网 / 超时 / 令牌环节失败。
    // 状态码为 null；匿名登录失败时 resolveToken 已把网关状态码带出来了。
    report.probeStatus = res.status === null ? 'no_response' : res.status;
    report.probeErrorName = res.errorName;
    report.probeErrorMessageSanitized = sanitizeErrorMessage(res.errorMessage);
  }

  // 最后一道保险：万一脱敏规则漏了什么东西，
  // 只要输出里还看得到令牌原文，就整段替换掉。
  // 这是**兜底**，不是主力 —— 主力是上面 sanitizeErrorMessage。
  if (typeof token === 'string' && token !== '' && report.probeErrorMessageSanitized !== '') {
    report.probeErrorMessageSanitized = report.probeErrorMessageSanitized
      .split(token).join('***');
  }

  return report;
}
/* ↑↑ DIAG-END ================================================= */

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

  /* ------------------------------------------------------------
   ⚠️⚠️ DIAG-BEGIN · Day 17 临时诊断入口，定位后删掉这一段即可。

   触发方式**两种都支持**（因为踩过一个坑）：
     ① 路径：/api/expenses/_diag   ← 推荐
     ② 查询参数：?__diag=1

   为什么必须留 ②：实测发现 `?month=2026-13` 能正常触发 400，
   说明网关**确实**会把查询参数传进来；但 `__diag` 这个名字取不回来。
   原因几乎可以肯定是网关（或它前面的网关层）对**双下划线开头**的参数名
   做了剥离 —— `__` 前缀在各类框架里都是内部保留字（`__proto__` 那类），
   注入防护会直接把它从 query 里删掉。所以诊断入口改走**路径**最稳。

   两种都没命中时，下面条件恒为假，**行为与改动前完全一致**。
   ------------------------------------------------------------ */
  const rawPath = String((event && event.path) || '');
  const diagByPath = /_diag\/?$/.test(rawPath);
  const diagByQuery = raw.__diag !== undefined && raw.__diag !== null && raw.__diag !== '';
  if (diagByPath || diagByQuery) {
    try {
      const report = await buildDiag();
      return json(200, { ok: true, data: report });
    } catch (err) {
      // 诊断自己都不该挂。挂了就回 500 + 脱敏后的原因，
      // 至少能知道「诊断跑到哪一步炸的」。
      console.error('[expenses][diag] 诊断入口自身异常：'
        + (err && err.name ? err.name : 'Error'));
      return fail(500, 'internal_error', '诊断入口自身异常（'
        + sanitizeErrorMessage(describeErrorDeeply(err)) + '）');
    }
  }
  /* ↑↑ DIAG-END */

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
    return fail(503, 'service_unavailable', unavailableMessage(translateReason(null)));
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
         所以这里只回一句人话 + 一个**分档原因**，真实细节留在服务端日志里。

       ⚠️ 日志纪律（比响应体更重要，日志是给运维看的）：
         · **只记 err.dbStatus（状态码）和 err.name（错误类）**
         · **不记 err.message** —— 它带域名、IP、端口
         · **不记 err 整个对象** —— 上面挂着的字段将来可能增加，
           整个打出来等于把内部结构一起日志
         状态码 + 错误名足够定位问题（401 是令牌问题、
         403 是权限问题、TypeError+无状态码是网络问题），又不会泄密。
       -------------------------------------------------------- */
    console.error('[expenses] 查询失败：网关状态码='
      + (err && err.dbStatus ? err.dbStatus : '无响应或超时')
      + '，错误名='
      + (err && err.name ? err.name : 'Error')
      + '，分档=' + translateReason(err));
    return fail(503, 'service_unavailable', unavailableMessage(translateReason(err)));
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
     · 503 消息 = 固定前缀 + 括号里的**分档原因**（见第 2 段之二）。
       前缀「数据库暂时连不上，稍后重试」一字未动，
       前端只认error.code，不解析 message —— 对前端零影响。

   ⚠️ 改造前后**对外行为零变化**：
     入参、字段名、排序规则、状态码、错误码、错误体形状、503 不回传原始报错
     —— 全部逐字未动。变的只有「怎么把数据取回来」这一层。
     api-contract.md v1.4 已在第二节补记这次部署路径调整。

   ⚠️ 有一处**故意的例外**，必须说清楚：
     503 的 message 后面多了一个括号，写着「网关返回 403，权限不足」这类分档。
     这**不算破坏契约**，因为 ——
       · 契约规定的是 error.code 和错误体形状，两者都一字未改
       · 契约第 343 行那句「响应里只有一句『数据库暂时连不上，稍后重试』」
         约束的是「不回传网关的原始报错正文」，分档原因不是原始报错，
         它是**我们自己写死的常量表**（第 2 段之二的 if 链），
         不含任何来自网关的动态内容
       · 真正要守住的那条线（不泄露令牌 / 密码 / host:port / 内网 IP /
         响应体正文）在第 2 段之二逐条列了，逐条都能对照代码验证
     如果将来还是希望message 一个字都不多，删掉 unavailableMessage()
     里的拼接即可，translateReason() 可以留着给日志用。
---- */
