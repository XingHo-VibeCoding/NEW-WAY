'use strict';

/* ============================================================
   简册 · 数据访问层 expensesRepository
   ------------------------------------------------------------
   文件：functions/expenses/expensesRepository.js
   归属：Day 19（从 index.js 拆出，**纯搬移，一行逻辑未改**）

   【它是什么】本项目对「数据访问层」这个说法的具体落地。
       以前「查数据库」这件事是直接写在 index.js 里的（第 3 / 5 / 6 段），
       于是 index.js 有 2180 行、七件事混在一起。
       Day 19 把「怎么跟数据库说话」这一整块搬到这里，
       index.js 从此只管「对外怎么答应」。

   【本文件负责什么】—— 全部与「跟数据库打交道」有关：
       · 第 0 段  为什么走 HTTP API 而不是 pg 直连
       · 环境变量 / 令牌三档回退 / URL 拼装（注入防护两层防线）
       · sendGet / sendWrite / httpGetJson / httpWriteJson
       · toFrontend（数据库列名 → 对外字段名）
       · queryExpenses（查） / createExpense（写）

   【本文件不负责什么】—— 一律不属于这里，越界了就是分层被破坏：
       · 响应外壳（ok / created / fail）→ index.js
       · 参数校验（month / type / limit / 写入五要素）→ index.js
       · 方法分流（GET / POST / 405）→ index.js
       · 503 的那句人话（unavailableMessage / translateReason）→ index.js
       ⚠️ 也就是说：本文件**不知道**HTTP 状态码对外意味着什么，
          它只负责「把数据取回来」和「把失败说成一个带 dbStatus 的 Error」。

   【为什么不共用一份给profile 用】
       CloudBase 每个云函数是**各自独立打包上传**的（zip 里只有本函数目录），
       函数之间**没有共享模块**这种机制。
       所以两个函数各带一份访问层，是平台形态决定的，不是偷懒。
       纪律与原来一致（照 profile/index.js 里那句「刻意保持一致」的写法）：
       两份访问层的差异只允许出现在「本表特有」的注释上，代码逐字相同。

   【Day 19 的铁律：搬移，不是重写】
       本文件所有代码是从 index.js **按行原样搬过来**的，
       没有任何一处逻辑被「顺手优化」。理由：
         · 契约（api-contract.md）一个字不许动
         · Day 17/Day 18 踩坑修出来的行为，一动就要重新验一遍
         · 搬移可以逐行比对，改写不能
       本地回归方式：把 git 里拆分前的版本与拆分后跑同一组用例，
       **逐字节比对响应体**（详见 Temp 目录下的回归脚本，不进仓库）。

   ⚠️ 打包提醒（Day 19 新增，写在这里免得下次忘了）：
      云函数靠**zip** 上传，zip 里只有 index.js 的话，
      这里的 require('./expensesRepository') 会直接报
      Cannot find module —— 接口全挂，且本地完全测不出来。
      重新打包时务必确认 zip 内含 index.js + expensesRepository.js + package.json。
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
    // 这里必须 catch：否则一次令牌故障会让整个查询直接抛出，
    // 上面那套「网关状态码分档」就永远用不上了。
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
  //
  // ⚠️⚠️ Day 18 顺手修的 Day 17 遗留：clearTimeout 的**位置**原来放错了。
  //
  // 【原来的写法与它错在哪】
  //     let resp;
  //     try { resp = await fetch(...); }
  //     catch (err) { return {...}; }
  //     finally { clearTimeout(timer); }   ← 在这里就清了
  //     ...
  //     data = await resp.json();          ← 读正文在 finally **之后**
  //
  //   fetch() 只在**收到响应头**时就 resolve。正文是之后流式来的，
  //   所以「拿到响应头」和「读完正文」是两件事。
  //   定时器在 finally 里被清掉 → 从那一刻起**再没有任何东西能打断读正文**。
  //   网关只回了头、正文卡住（半开连接、代理缓冲丢包、数据库锁住不返回）时：
  //     · fetch 已 resolve，不会有 AbortError；
  //     · resp.json() 永远不 settle；
  //     · 定时器已经清了，没人来打断。
  //   → **函数永久挂死，一个响应都不返回**。
  //   QA 实测复现过：网关只发响应头然后卡住，2 秒内既没回 200 也没回 503。
  //
  // 【为什么说这是 Day 17 的遗留、不是 Day 18 引入的】
  //   Day 18 的 sendWrite 是照着 sendGet 抄的，两边是同一个模式。
  //   Day 17 上线的读路径当时就有这个问题（只是没人触发过）。
  //   所以它**不是本次回归**，但既然已经看见了就一起修——
  //   而且修读路径的理由比修写路径还硬：写路径挂死只是「用户的账没记上」，
  //   读路径挂死是**列表转圈永远转不出来**，用户连已有的账都看不到。
  //
  // 【修法：把 clearTimeout 挪到覆盖「取响应头 + 读正文」整体的外层 finally】
  //   这样定时器在正文读完（或读失败）之前一直活着，
  //   卡住时 controller.abort() 会把挂着的 resp.json() 打断，
  //   它抛 AbortError → 被下面的 catch 接住 → 走「读不出来」那一支 → 503。
  //   **超时从「只管响应头」升级成「管整个往返」。**
  //   ⚠️ 代价：终于不用手写「每个 return 前记得清定时器」了 ——
  //      写成外层 finally 之后，清定时器这件事**不可能被漏掉**。
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
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
      // ⚠️ 这一行现在**受定时器保护**（Day 18 修，见上面那段说明）。
      //   正文卡住时 controller.abort() 会把它打断，这里走 catch → 503。
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
  } finally {
    // 只有到这里（正文读完 / 出错 / 返回）才清定时器。
    clearTimeout(timer);
  }
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
   第 3 段之二 · 写入用的 HTTP 层（POST）—— Day 18 新增
   ------------------------------------------------------------
   这一段是第 3 段（sendGet / httpGetJson）在**写入方向上的对应物**。
   为什么另起一段，而不是把 sendGet 改成 sendRequest(url, method, body)：
   读和写要的东西**根本不同**，硬合并成一个函数只会得到一个到处是
   if (method === 'POST') 的四不像。分开写，每一段都一眼看得懂。

     读（GET）要的：拿到数组 / 拿不到就抛，状态码塞 dbStatus
     写（POST）要的：201 + 回来的完整对象 / 主键撞了要说「已经记过了」

   ⚠️ 写入的官方姿势（官方文档 docs.cloudbase.net/http-api/pgdb/insert-records）：

       POST https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/expenses
       Authorization: Bearer <token>
       Content-Type: application/json
       Prefer: return=representation
       Body: {单个 JSON 对象}

     · 成功 201，响应体是**数组** `[{...}]`；响应头 content-range 带一个 `*` 和 1
       （形如「*&#47;1」）表示影响了 1 行
       ⚠️ 写文档时注意：那个「*&#47;1」在 JS 注释里必须转义成实体，
          直接写 `*` 加斜杠会**提前结束块注释**，整个文件当场语法错误。
     · `Prefer: return=representation` **必须带**：不带的话网关只回 201 一个空壳，
       我们拿不回刚写进去的那条记录，而 201 的契约要求「返回新建的完整对象」。
       这一行不是可选项，去掉了 201 就没有 body 可返。
   ============================================================ */

/** 写入超时。跟读同一个值（REQUEST_TIMEOUT_MS），不另立规矩 —— 同一个网关，写没理由比读更耐心。 */
const WRITE_TIMEOUT_MS = 8000;

/**
 * 判断一段网关报错正文里有没有「唯一约束冲突」的痕迹。
 *
 * ⚠️⚠️ 这个函数是本文件里**唯一**允许读网关报错正文的地方，必须说清楚为什么：
 *
 *   Day 17 立的铁律是「绝不回传网关响应体正文」（正文里可能带表结构、列名）。
 *   「回传」和「读」不是一回事：
 *     · 我们**读**它，只是为了判断这一句 400 到底是不是「这个 id 已经存在」；
 *     · 判定完立刻丢弃——不返回、不日志、不拼进任何对外字段。
 *   也就是说：**内容一次都不外泄，只有一个 true / false 出门。**
 *
 *   为什么非要判断：PostgREST 语义下唯一冲突是 409，但网关不一定照办，
 *   见过把同一个错误包成 400 回来的。只认 409 的话，第二种情况会掉进
 *   「数据库连不上」的 503 里 —— 用户明明是重复提交，却被告知稍后重试，
 *   于是又点一次，**重复记账照旧发生**，防重形同虚设。
 *
 * 【⚠️⚠️ 这个坑是怎么被发现的 —— Day 18 修 bug 记录，读代码前先看】
 *   Day 18 第一版的关键词表是 6 个词：
 *     ['23505', 'duplicate key', 'unique constraint', 'already exists', '唯一约束', '重复键']
 *   QA 用**逐个造假正文**的办法测，**6 个词每一个都造成假阳性**。
 *   最致命的一条：网关回 `500` + 正文
 *       {"code":"42P07","message":"relation \"expenses\" already exists"}
 *   —— 42P07 是 PostgreSQL 的 duplicate_table（表已存在），
 *   和「这一行 id 重复」**完全是两回事**，但 `already exists` 命中了，
 *   于是这个 500 被翻译成 **409「这笔已经记过了，没有重复添加」**。
 *
 *   后果链条很可怕：数据库挂了 / 表被误删 / 权限掉了
 *     → 用户界面显示「已经记过了」
 *     → 前端按 code: duplicate_submission 分支弹提示并**刷新列表**
 *     → 用户以为记成功了，实际库里一行都没有。
 *   这是「静默丢数据 + 错误告知」，是最难排查的一类故障，
 *   而且恰好打在这个接口对外的核心承诺（防重复提交）上。
 *
 * 【两条修法，缺一不可】
 *   ① 关键词收窄到**只有两种精确认识**（见下面 keys），宽泛词全部删掉。
 *   ② 加**状态码门槛**（见 isUniqueConflictStatus）——
 *      500 及以上一定是服务端自己的问题，不是用户重复提交。
 *
 * @param {string} text 网关报错正文原文
 * @returns {boolean} 命中唯一冲突的精确认征就返回 true
 */
function looksLikeUniqueViolation(text) {
  if (typeof text !== 'string' || text === '') {
    return false;
  }
  const lower = text.toLowerCase();
  /* ⚠️ 关键词表只留「精确认识」，一个宽泛词都不加。
     逐条说明为什么留、为什么不留（这些都是 Day 18 实际踩过的）：

       '23505'  ✅ 留 —— PostgreSQL 的 unique_violation **SQLSTATE**，
                   是机器对机器的精确编码，不存在第二种含义。
                   唯一的残余风险是「5xx 正文里也含 23505」，
                   那一风险由状态码门槛（isUniqueConflictStatus）挡住。

       'duplicate key value violates unique constraint'  ✅ 留 ——
                   PostgreSQL 唯一冲突的**标准完整句**。整句匹配，不匹配其中一段。

       'duplicate key'                      ❌ 删 —— 它是上面那句的**前缀**，
                   单独用它会把 "duplicate key value violates exclusion constraint"
                   （排他约束，另一种错误）也当成主键冲突。
       'unique constraint'                  ❌ 删 —— 它出现在**建表报错**里
                   （「there is no unique constraint for given relation」），
                   建表失败和插入重了是两件事。
       'already exists'                     ❌ 删 —— 就是 42P07 那个坑。
                   「表已存在」和「这一行 id 已存在」只差一个主语。
       '唯一约束' / '重复键'                  ❌ 删 —— 中文关键词是**猜**网关的
                   中文措辞，猜错了就是误判，猜漏了是漏判。
                   两个方向都错，那就不猜：网关回英文原文（SQLSTATE 与
                   message 都来自 PostgreSQL），只认英文原文。
     */
  const keys = ['23505', 'duplicate key value violates unique constraint'];
  for (let i = 0; i < keys.length; i++) {
    if (lower.indexOf(keys[i]) !== -1) {
      return true;
    }
  }
  return false;
}

/**
 * 这个状态码**允许**被翻译成 409「已经记过了」。
 *
 * ⚠️ 为什么要单独一个函数、为什么这道门槛是关键的（Day 18 实测踩出来的）：
 *   「正文命中唯一冲突特征」和「这次失败真的是用户重复提交」**不是同一件事**。
 *   状态码是网关给出的、对本次失败性质的**第一手判断**，比正文里的一句话可靠。
 *
 *   · 409 —— PostgREST 对唯一冲突的标准答案。直接采信，不需要看正文。
 *   · 400 —— 请求本身有问题。可能是 id 重复，也可能是别的 CHECK 没通过
 *     （金额越界、分类与 type 错配…）。所以**还要正文命中精确特征**才认。
 *   · 422 —— 与 400 同类的语义错误网关（有些网关把 400 换成 422），同理。
 *   · 5xx / 其它（401 令牌、403 权限、404 表不存在、502/503 网关自己挂了…）
 *     —— **一律不算重复提交**。
 *
 *   500 及以上为什么一定要排除干净：
 *     那些是「服务端自己出事了」（表不存在、连接断掉、约束执行器崩了）。
 *     哪怕正文里**真的**出现了 23505（约束执行器自己崩了也可能带上），
 *     也不该告诉用户「已经记过了」—— 用户会以为不用再记，
 *     而实际上这笔账根本没进库。**宁可多报一次 503 让用户重试，也不能谎报成功。**
 *
 * @param {number} status 网关回的 HTTP 状态码
 * @returns {boolean} 这个状态码允许走唯一冲突判定就返回 true
 */
function isUniqueConflictStatus(status) {
  // 只放行这三个。注意 500/502/503 **刻意不在列** —— 理由见上面注释。
  return status === 409 || status === 400 || status === 422;
}

/**
 * 发一次 POST，**只如实描述结果，不做判断**（与 sendGet 同一套纪律）。
 *
 * ⚠️ 与 sendGet 的两处**故意不同**，都跟「写」这件事有关：
 *
 *   ① 非 2xx 时**读了**响应体（sendGet 刻意不读）。
 *      唯一理由：主键冲突有可能被网关包成 400（见 looksLikeUniqueViolation）。
 *      读回来只喂给那个判断函数，返回值里只留一个 duplicate 布尔值，
 *      **正文本身不出现在这个返回对象里**。
 *
 *   ② 成功时把响应体留在 json 里（sendGet 成功时才留，非 2xx 从不留）。
 *      因为 201 必须把刚写进去的那条记录回给前端，正文就是那条记录。
 *
 * @param {string} url   完整 URL（由 restUrl 拼好）
 * @param {object} row   要写入的**数据库列名**对象
 * @returns {Promise<object>} 永远 resolve，不 reject：
 *   { reached, status, json, duplicate, errorName, errorMessage, elapsedMs }
 */
async function sendWrite(url, row) {
  const startedAt = Date.now();

  let token;
  try {
    token = await resolveToken();
  } catch (err) {
    return {
      reached: false,
      status: err && err.dbStatus ? err.dbStatus : null,
      json: undefined,
      duplicate: false,
      errorName: err && err.name ? err.name : 'Error',
      errorMessage: describeErrorDeeply(err),
      elapsedMs: Date.now() - startedAt
    };
  }

  /* ⚠️⚠️ Day 18 修：clearTimeout 的位置（与 sendGet 同一个坑，一起修）。
     原来定时器在 fetch 的 finally 里就清了，而读正文（resp.text() / resp.json()）
     在它之后 —— 网关只回响应头、正文卡住时没有任何东西能打断读正文，
     函数**永久挂死不返回**。
     写路径上这个后果比读路径更严重：用户点了「保存」，界面一直转圈，
     账**没记上**、用户**不知道**，他很可能会再点一次 —— 于是又是一次无防重的提交。
     （没带 clientToken 时真的会记两笔。）
     修法与 sendGet 一致：clearTimeout 挪到覆盖「取头 + 读正文」的外层 finally。
     完整踩坑记录见 sendGet() 里那段注释。 */
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, WRITE_TIMEOUT_MS);

  try {
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          // 这一行是 201 能返回完整对象的**唯一**原因，别删。理由见本段开头。
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(row),
        signal: controller.signal
      });
    } catch (err) {
      return {
        reached: false,
        status: null,
        json: undefined,
        duplicate: false,
        errorName: err && err.name ? err.name : 'Error',
        errorMessage: describeErrorDeeply(err),
        elapsedMs: Date.now() - startedAt
      };
    }

    if (!resp.ok) {
      /* --------------------------------------------------------
         失败分支：**读**正文，只为了判断「是不是唯一约束冲突」。
         读到的这段文字在这一行之后就不再被任何人看到——
         判定完就随函数返回丢弃，不入日志、不入响应、不入任何字段。
         真正的对外信息只有：状态码（进 err.dbStatus）+ duplicate 布尔值。

         ⚠️⚠️ Day 18 修 bug：这里原来是
            `resp.status === 409 || looksLikeUniqueViolation(bodyText)`，
            漏了**状态码门槛**，导致网关回 5xx 时也会走正文判定，
            把「表已存在 / 数据库故障」误报成「这笔已经记过了」。
            假阳性的完整后果链条见 looksLikeUniqueViolation() 的注释。
            现在改成：**先过状态码门槛，再看正文**。
         -------------------------------------------------------- */
      let bodyText = '';
      // ⚠️ 只有状态码允许时才读正文。5xx 一律**连读都不读** ——
      //   不是为了省那点内存，是因为读了就有诱惑去用它，
      //   而 5xx 的正文永远不该参与「是不是重复提交」的判断。
      //   （读它本身不会泄露：正文从不外泄。但不读能从根本上杜绝误判。）
      if (isUniqueConflictStatus(resp.status)) {
        try {
          // ⚠️ 这一行现在**受定时器保护**（Day 18 修，见上面那段注释）。
          bodyText = await resp.text();
        } catch (err) {
          // 正文读不出来（连接被掐、断流、超时被 abort）不算失败：
          // 状态码已经拿到了，duplicate 猜 false 即可，剩下的交给 503。
          // ⚠️ 这里**刻意不把 AbortError 升级成「算唯一冲突」**——
          //   超时意味着「我们不知道发生了什么」，而「不知道」绝不能翻译成
          //   「已经记过了」这种会让用户以为成功的结论。
          bodyText = '';
        }
      }

      return {
        reached: true,
        status: resp.status,
        json: undefined,
        // 409 是 PostgREST 的标准答案，直接采信；400 / 422 还要正文命中精确特征。
        // 其它状态码（401/403/404/5xx…）在这里**一定**是 false。
        duplicate: resp.status === 409 || looksLikeUniqueViolation(bodyText),
        errorName: null,
        errorMessage: '',
        elapsedMs: Date.now() - startedAt
      };
    }

    let data;
    try {
      // ⚠️ 这一行现在**受定时器保护**（Day 18 修）。
      data = await resp.json();
    } catch (err) {
      return {
        reached: true,
        status: resp.status,
        json: undefined,
        duplicate: false,
        errorName: err && err.name ? err.name : 'Error',
        errorMessage: describeErrorDeeply(err),
        elapsedMs: Date.now() - startedAt
      };
    }

    return {
      reached: true,
      status: resp.status,
      json: data,
      duplicate: false,
      errorName: null,
      errorMessage: '',
      elapsedMs: Date.now() - startedAt
    };
  } finally {
    // 只有到这里（正文读完 / 出错 / 返回）才清定时器 —— 见上面那段说明。
    clearTimeout(timer);
  }
}

/**
 * 发一次 POST，把写进去的那条记录取回来。
 *
 * 失败时抛出的错误对象上带：
 *   · `dbStatus`   —— 网关状态码（供日志与分档用）
 *   · `duplicate`  —— true 表示「这个 id 已经有了」，调用方据此回 409
 *
 * ⚠️ 错误对象上**只有这两个字段**，没有响应体、没有 message 原文 ——
 *    铁律（不回传网关正文）在这一层就落实，不靠调用方自觉。
 *
 * @param {string} url 由 restUrl() 拼好的完整 URL
 * @param {object} row 数据库列名对象
 * @returns {Promise<object>} 刚写进去的那一行（数据库列名）
 */
async function httpWriteJson(url, row) {
  const res = await sendWrite(url, row);

  if (!res.reached) {
    /* 与 httpGetJson 同一套纪律：只把状态码带出去，正文一个字不回传。
       401 令牌无效 / 403 权限不足（**写接口最可能**：令牌角色没有 INSERT 权限）
       / 404 表不存在 / 400 请求有问题（除主键冲突外） / 超时 —— 都归到 503。 */
    const err = new Error('rdb rest write failed');
    err.dbStatus = res.status;
    throw err;
  }

  if (res.duplicate) {
    /* 防重复提交命中：同一个 clientToken 第二次提交，撞主键。
       这不是「数据库坏了」，是一个**正常的业务结果**，所以单独一个错误类型，
       不和 503 混在一起。message 固定，不带任何来自网关的内容。 */
    const err = new Error('duplicate submission');
    err.dbStatus = res.status;
    err.duplicate = true;
    throw err;
  }

  // 走到这里说明 resp.ok（2xx）。但还要查形状：
  // 官方文档说成功回数组，数组第一项才是刚写进去的那条记录。
  // 万一网关回了对象 / 空数组 / 一段不是 JSON 的文字，带错进 main 会炸出
  // 「undefined is not a function」那种看不懂的错，不如在这儿就抛清楚。
  const data = res.json;
  if (res.errorName !== null || !Array.isArray(data) || data.length === 0) {
    const err = new Error('unexpected write response shape');
    err.dbStatus = res.status;
    throw err;
  }

  /* ------------------------------------------------------------
   ⚠️⚠️ Day 18 修 bug（出口字段校验）—— 这个坑是怎么被发现的：

   原来只查到上面那三行就 return data[0]。
   QA 用「网关回 201 但正文残缺」的方式测，发现两种漏法：

     ① 回 `[{ "id":"ex_x", "amount":"1.00", "note":null }]`（只有 3 个字段）
        → 代码回 **201**，body 只有 3 个字段，缺 date / type / category /
          createdAt / updatedAt。前端拿到 undefined 会渲染成空值。

     ② 回 `[123]` / `["abc"]` / `[[]]` / `[true]`
        → 全部回 201，body 是 `{"amount":null,"note":""}`。

   ② 比 ① 严重得多：**这一笔是真的写进库了**，但回给前端的是一份残缺对象。
   前端把它追加到列表里，用户看到「undefined 元」，
   而实际上数据库里有这笔账 —— 界面和数据库**永久对不上**，
   用户越用越糊涂，却查不出任何错误信息（我们回的是 201「成功」）。

   所以这里补一道**出口校验**：201 的契约要求「返回新建的完整对象」
   （契约第五节第 4 条，8 个字段），少一个都不算成功。

   ⚠️ 两个容易写错的点：
     · 校验必须按**数据库列名**（created_at / updated_at，下划线）对，
       **不是**驼峰 —— 这里是网关回的原始行，驼峰转换发生在后面的
       toFrontend() 里。拿驼峰去对会「明明齐全也判成缺失」。
     · 元素必须是**对象**且非 null。`[123]` 在下面第一关就被拦住；
       `[null]` 也被同一关拦住（typeof null 是 'object' 但不是真对象，
       所以额外判了 !== null）。
   ------------------------------------------------------------ */
  const written = data[0];
  if (written === null || typeof written !== 'object' || Array.isArray(written)) {
    const err = new Error('unexpected write response item');
    err.dbStatus = res.status;
    throw err;
  }
  // 8 个必填列，缺任何一个都不给过。
  // 用「列名在不在」而不是「值对不对」：值的类型/格式由 toFrontend() 与
  // 数字库自己的约束负责管，这里只管「字段齐不齐」这一件事。
  const REQUIRED_COLUMNS = [
    'id', 'date', 'amount', 'type', 'category', 'note', 'created_at', 'updated_at'
  ];
  for (let i = 0; i < REQUIRED_COLUMNS.length; i++) {
    // hasOwnProperty 而不是 `in`：防原型链上的 inherited 属性冒充字段。
    if (!Object.prototype.hasOwnProperty.call(written, REQUIRED_COLUMNS[i])) {
      const err = new Error('incomplete write response');
      err.dbStatus = res.status;
      throw err;
    }
  }

  return written;
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
   第 6 段之二 · 写数据库（Day 18 新增）
   ============================================================ */

/**
 * 把一笔账写进数据库。
 *
 * ⚠️ 这里的 URL **不带任何查询参数** —— restUrl 传一个空数组即可。
 *   读接口那一堆 select / order / limit 在写入时全是多余的：
 *   插一行没有「排序」「筛选」「取几行」可言，多写一个参数就是多一个
 *   出错的地方。restUrl 第二个参数给空数组是它本来就支持的用法
 *   （`parts.length > 0 ? '?' + ... : ''` 那一行就是为它写的）。
 *
 *   表名这里直接写 'expenses' 字面量，与 queryExpenses() 保持一致 ——
 *   同一个文件里两处都写一遍字面量，比「一处用常量、一处写字面量」好读。
 *   哪天真的要改成多张表时，再一起抽常量，那是一次全局替换，不会漏。
 *
 * ⚠️ 写进去的是**数据库列名**（created_at / updated_at），
 *    出去的时候用 toFrontend() 换回驼峰。两边的转换分别在
 *    validateExpenseInput（入）和 toFrontend（出），职责单一。
 *
 * @param {object} row validateExpenseInput 产出的、已校验的数据库行
 * @returns {Promise<object>} 刚写进去的那一行，已翻译成前端形状
 */
async function createExpense(row) {
  const written = await httpWriteJson(restUrl('expenses', []), row);
  return toFrontend(written);
}

/* ============================================================
   对外接口（本文件只暴露这四样）
   ------------------------------------------------------------
   暴露 runtime 是因为 index.js 的两处判断需要知道
   「环境变量配了没 / 运行时有没有 fetch」：
     · 503 那句人话要靠它分档（translateReason 里读configError / hasFetch）
     · 真正发请求前的那道拦截在 index.js 里
   它只暴露「状态」，不暴露「怎么连」—— 连接细节一律留在本文件内部。
   ============================================================ */
module.exports = {
  runtime: { configError: configError, hasFetch: hasFetch },
  queryExpenses: queryExpenses,
  createExpense: createExpense
};
