'use strict';

/* ============================================================
   简册 · 云函数 profile
   ------------------------------------------------------------
   文件：functions/profile/index.js
   功能：GET /api/profile —— 读「个人参数」这一行配置
   归属：Day 17（第 3 周第一个业务读接口，与 expenses 同批）
   依据：api-contract.md 第五节第 11 条（永远 200 / 405）
        + 第二节通用约定（字段名不改编、金额是数字）
        + 第三节（profile 是单行表，全库永远只有 1 条）

   今天范围：只做「读」。PUT（存参数）是第 12 号接口，留 Day 18。

   它的位置：对应课程打卡案例里 plan_days 那种「单行配置表」——
           全库只有一条、代表「当前这套个人参数是什么」。
           它和 expenses 最大的不同是：
             expenses 查不到 → 返回空数组，前端画个空列表就行；
             profile 查不到 → **也必须返回一个字段齐全的对象**。
           原因见下面「永远 200」那一段。

   ⚠️ 红线自查（AGENTS.md 附三第 3/4/5 条）：
      · 本文件不出现任何招聘网站名（那 5 个域名见 AGENTS.md 附三第 5 条，
        这里刻意不写出来 —— 写了源码里就真出现了，grep 一扫就命中，
        自己也说不清是「注释」还是「真用了」。规则见文件，名字去规则里查）
      · 不引入爬取、不引入任何第三方 SDK（**数据库驱动也不要了**，
        原因见下面「第 0 段」——这是 Day 17 部署当天被平台限制逼出来的改动）
      · contact 是**红线字段**：只读出来给本机显示，
        绝不出现日志 / 错误信息 / 注释示例的真实值，绝不发给大模型
        （api-contract 第八节红线第2、3 条）
      · 注释里不出现任何真实姓名 / 手机号 / 邮箱
      · 连接信息只从环境变量读，代码里不硬编码域名和密钥
   ============================================================ */

/* ============================================================
   第 0 段 · 数据访问方式：为什么从 pg 直连改成 HTTP API
   ------------------------------------------------------------
   ⚠️ 这一段是 Day 17 部署当天才补的，读代码前先知道它。

   【原来】node-postgres（pg）走 PostgreSQL 协议 TCP 直连，
           需要 PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD，
           后两个是**数据库自己的账号密码**。

   【为什么改】用户用的是 CloudBase **个人版**，不提供数据库连接地址。
       社区 issue #1237 官方回复原话：「在你当前的个人版套餐下，
       就算把这四个值全部填对，TCP 直连也连不上」→ 这条路走不通。

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
       Publishable Key 是控制台直接生成的一串 key，不是数据库账号、
       不用申请。这正是它绕开个人版限制的原因。
       （另两种：access_token 来自登录，2 小时有效；API Key 权限更大，
         官方明确说不能暴露在前端。云函数在后端，用哪个都安全，
         但 Publishable Key 最省事、不用处理过期，所以当默认值。）

   【这一版的代价】SQL 变成了 PostgREST 查询语法，
       但变的只是「怎么描述查询」，**返回什么一个字没改**。
   ============================================================ */

/* ------------------------------------------------------------
   环境变量（云开发控制台 → 云函数 → 函数详情 → 配置 → 环境变量）

   ┌────────────────┬──────────────────────────────────────────────┐
   │ 变量名           │ 含义 / 去哪抄│
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
   │                │ 数据库密码。                │
   │                │                                                │
   │                │ ⚠️ 它是密钥，抄在纸上，不要写进代码、不要提交    │
   │                │    （AGENTS.md 第五节第 3 条）                  │
   └────────────────┴──────────────────────────────────────────────┘

   ⚠️ 不再需要 PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD —— 全部作废。
      代码里**一处 process.env 也没有赋值**，全是读取（保持原样）。
   ------------------------------------------------------------ */

/** 启动期检查的结果。空字符串 = 没问题；非空 = 缺了什么。 */
const configError = process.env.TCB_ENV ? '' : '缺少环境变量 TCB_ENV';

/**
 * 单次请求超时（毫秒）。
 *
 * 为什么必须有：云函数默认超时往往几十秒到几分钟，不设超时的话，
 * 网关那边卡住会让函数一直挂着，平台要等它自己超时才回收 ——
 * 期间这次调用占着资源，而浏览器还在转圈。8 秒是我们能接受的上限：
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
 * 而是把 statusCode / headers / body 原样当 HTTP 响应发出去。
 * 状态码由我们说了算 —— 405 / 503 都靠它。
 *
 * 从 functions/health/index.js 原样照抄：同一个项目里两个云函数
 * 的响应格式必须一模一样，不然后面维护的人要同时记两套写法。
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
      // 而这个接口回的是**用户自己的个人参数**（含联系方式）。
      // 让中间层缓存一次，等于把个人资料留在了别人的硬盘上。
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(payload)
  };
}

/* ============================================================
   第 2 段 · 成功 / 失败两种壳子
   ------------------------------------------------------------
   ⚠️ Day 17 拍板：响应统一套壳。
      契约第二节原来写「成功直接返回数据本体」，今天改成统一
      { ok, data } / { ok, data, error } 三字段形状。
      理由：现在全项目只有 health 一个函数要跟着改（第 3 周共 8 个接口），
      中途换格式前端要改一大圈，越晚换越贵。
   ============================================================ */

/**
 * 组装成功响应。
 * @param {*} data 业务数据（本接口是一个对象）
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
 * @param {string} [field]    出错的是哪个输入框（可选）
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

   与 expenses/index.js 的这一段**逐字相同**——刻意保持一致：
   同一个项目里两个云函数的取数写法必须一模一样，
   不然以后维护的人要同时记两套写法。
   ============================================================ */

/**
 * 运行时有没有 fetch。
 *
 * 为什么要专门查一次：官方云函数运行时是 Node 18，fetch 自带；
 * 但万一部署时选了更老的运行时（Node 16 没有全局 fetch），
 * 直接调 fetch 会抛「fetch is not defined」，报错难懂还看不出根因。
 */
const hasFetch = typeof fetch === 'function';

/**
 * 匿名登录换来的临时令牌，缓存在内存里复用。
 *
 * 为什么缓存：access_token **2 小时就过期**，而云函数每次被调用
 * 可能是一个全新进程、也可能是复用同一个进程。
 *   · 每次请求都重新登录 → 多一次网络往返，慢且不礼貌；
 *   · 完全不缓存 → 2 小时后第一次请求必然 401。
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
 * 原来用 pg 时，防注入靠「SQL 参数化」——值永远不进 SQL 文字。
 * 改成 HTTP 之后**没有驱动替我们做这件事了**，
 * 查询条件必须自己拼进 URL，所以「拼」本身就有了注入风险。
 *
 * 现在的防线是**两层，缺一不可**：
 *
 *   第 1 层 · 参数校验
 *      本接口**没有用户输入**（契约第五节第 11 条明写「请求参数：无」）——
 *      所以第 1 层是「常量写死」，比 expenses 还简单。
 *      唯一拼进去的用户无关值 'profile_singleton' 是本文件里的常量。
 *
 *   第 2 层 · 每个键值都过 encodeURIComponent
 *      它会把 `&` `=` `?` `#` `/` 这些「能改变 URL 结构」的字符全部转义。
 *      这就是 HTTP 版本的「参数化」，对应 pg 那时的 $1。
 *
 *   ⚠️ 以后这个接口若加入查询参数，第 1 层要先补上校验，
 *      且**一律走这个函数拼，不要自己拼字符串**。
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
 * 优先用 TCB_TOKEN（Publishable Key / API Key / 手工拿到的 access_token 都行）
 * ——它不会过期，最省事。没配就退回「匿名登录」现换一个 access_token。
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

  // 匿名登录。官方文档原文：POST {base}/auth/v1/signin/anonymously，body 为 {}
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
 * 供调用方记日志用。**不带响应体**——原因见下面注释。
 *
 * @param {string} url 由 restUrl() 拼好的完整 URL
 * @returns {Promise<Array<object>>} 返回的记录数组
 */
async function httpGetJson(url) {
  const token = await resolveToken();

  // AbortController + setTimeout = 手动实现超时。
  // fetch 自己不会超时，不设的话请求可能永远挂着。
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
       尤其本表含contact（联系方式）—— 万一哪天网关的报错里
       掺进了数据内容，写进日志就是红线事故。所以只传状态码出去。

       401 = 令牌无效/过期  403 = 权限不足（本表没授权/RLS 没配 Policy）
       404 = 表不存在或路径不对   400 = 查询语法不被接受
       -------------------------------------------------------- */
    const err = new Error('rdb rest request failed');
    err.dbStatus = resp.status;
    throw err;
  }

  const data = await resp.json();

  /* 官方文档原文：「当前数据返回都是以数组的形式返回」。
     保险起见还是查一下 —— 万一返回了别的东西，
     带着这个错误进 catch，能回一句明确的 503，
     而不是让 .length 报「undefined is not a function」那种看不懂的错。 */
  if (!Array.isArray(data)) {
    const err = new Error('unexpected response shape');
    err.dbStatus = resp.status;
    throw err;
  }

  return data;
}

/* ============================================================
   第 4 段 · 单行表的空对象
   ============================================================ */

/**
 * 表里查不到记录时返回的「空参数」。
 *
 * ⚠️ 关键设计：字段全部齐全，值全部是 null。
 *
 * 为什么不返回 null 或者 404：
 *   profile 是单行表，永远只有 1 条。如果它可能不存在，前端每次读都得写
 *   「if (没有数据) { 用一套默认值 } else { 用真实值 }」这种判断，
 *   而且两套默认值要跟着一份代码改两遍。
 *   契约第五节第 11 条写明「永远 200，字段齐全、值为 null」，
 *   就是为了让前端**不用判空**：拿到就用，值是 null 就显示成空白。
 *
 * 为什么 id 固定写 'profile_singleton'：
 *   schema.sql 里profile.id 有 CHECK (id = 'profile_singleton')，
 *   整张表只认这一个名字（单行表得有个锁死的名字，
 *   不固定的话每跑一次 seed 就多一行，「永远只有一条」的口径就破了）。
 *   即使表里没记录，我们造出来的对象也用同一个 id ——
 *   前端拿到的形状永远一致。
 *   对外返回这个 id 已由契约第五节第 11 条登记（不是本文档擅自加的）。
 *
 * @returns {object} 字段齐全、值为 null 的个人参数对象
 */
function emptyProfile() {
  return {
    // id 固定这一个值，**契约第五节第 11 条已登记**（Day 17 已把示例 JSON 补上这个字段）。
    //
    // 为什么契约与代码曾一度不同步、现在以契约为准：
    //   TECH_DESIGN 5.3 原本只列了 6 个用户数据字段，没有 id；
    //   而契约第二节又写死「字段名不改名、不加新名」——
    //   两边都没错，但没写在一起，读者只看一边就会怀疑。
    //   现在契约第二节补了例外条款、第五节第 11 条的示例也补上了 id，
    //   两边对齐了。**依据是契约，不是本文档的注释。**
    //
    // 要确认就去看 api-contract.md：
    //   第二节「『不改名、不加新名』的唯一例外：单行表携带固定 id」
    //   第五节第 11 条示例 JSON 里的 "id": "profile_singleton"
    id: 'profile_singleton',
    savings: null,
    monthlyExpense: null,
    name: null,
    contact: null,
    targetRole: null,
    updatedAt: null
  };
}

/* ============================================================
   第 5 段 · 数据库行 → 前端对象
   ============================================================ */

/**
 * 把一行记录翻译成前端认识的字段名和类型。
 *
 * 三件容易做错的事：
 *
 * ① 字段改名（数据库下划线 → 对外驼峰）：
 *    monthly_expense → monthlyExpense、target_role → targetRole、
 *    updated_at → updatedAt。对外形状由契约第五节第 11 条规定。
 *
 * ② savings 必须 Number()：
 *    savings 是 numeric(12,2)（精确小数）。经过 HTTP API 回来时，
 *    它**可能是 JSON 数字 30000，也可能是字符串 "30000.00"**
 *    —— 取决于网关把 numeric 序列化成什么。Number() 对两种都给出
 *    同一个结果，所以这行**不管哪种情况都正确**，不用改。
 *
 *    为什么必须转：万一拿到的是字符串，"30000.00" / 1000
 *    在某些计算里会算出 30 而不是 30.0000，
 *    「还能撑几个月」这个除法直接错 —— 而且错得很安静。
 *    （schema.sql 第 2.3 节末尾提前打过这个招呼）
 *
 *    📌 待实测确认：本地只能验证「传字符串时行为正确」；
 *       CloudBase 网关实际返回数字还是字符串，须在部署后按
 *       DEPLOY.md 五-3 验证点 3 核对一次。无论哪种，本行都成立。
 *
 * ③ monthlyExpense 的 null **必须原样保留**：
 *    它的含义是「我没手填，请前端按近 3 个自然月自动算」
 *    （契约第五节第 11 条）。写成 0 的话前端会当成「月均支出 0 元」，
 *    底牌页那个除法直接崩。所以这里绝对不能写 `Number(x) || 0` ——
 *    那种「顺手兜个底」的写法会把 null 变成 0，是本文件最容易踩的坑。
 *
 * @param {object} row 一行记录（键名与数据库列名一致）
 * @returns {object} 前端要的对象
 */
function toFrontend(row) {
  return {
    id: row.id,
    // NOT NULL + CHECK (savings >= 0)，不会是 null
    savings: Number(row.savings),
    // 允许 null，且null 有明确含义 —— 见上面 ③
    monthlyExpense: row.monthly_expense === null || row.monthly_expense === undefined
      ? null
      : Number(row.monthly_expense),
    // 下面三个是可空的普通文本，null 就给 null（前端显示成空白即可）
    name: row.name === undefined ? null : row.name,
    /* 🔴 contact —— 红线字段
       只读出来给「简历预览页」在本机显示。
       绝不发往大模型（AGENTS.md 附三第 5 条），
       绝不写进日志 / 错误信息，注释里也不写任何真实值。
       本文件只做「原样读出」，不做任何加工，也不参与任何外发。 */
    contact: row.contact === undefined ? null : row.contact,
    targetRole: row.target_role === undefined ? null : row.target_role,
    updatedAt: row.updated_at
  };
}

/* ============================================================
   第 6 段 · 查数据库
   ============================================================ */

/**
 * 读出那一行个人参数。
 *
 * ⚠️ 本函数最要紧的一条纪律：**绝不裸拼用户输入**。
 *
 * 这个接口**没有**用户输入（无查询参数），但照样走restUrl() 转义：
 *   转义是**规矩**，不是「今天没危险所以省了」。
 *   今天把 'profile_singleton' 也照样转义，是为了明天改代码的人
 *   一眼看出「这里也是守规矩的」，而不是留下一段示范反面教材。
 *
 * 【语法对照】左 SQL 右 PostgREST，依据官方文档「HTTP API 基于 PostgREST 协议」：
 *   SELECT id, savings, ...   →  select=id,savings,monthly_expense,...
 *   WHERE id = $1             →  id=eq.profile_singleton
 *   LIMIT 1                   →  limit=1
 *
 * 【为什么 limit=1】单行表理论上只有一条，加limit 1 是「万一」的第二道保险，
 *   避免将来数据结构变了这里突然返回数组。取 rows[0] 就够了。
 *
 * @returns {Promise<object>} 前端形状的个人参数对象
 */
async function queryProfile() {
  const params = [];

  // 不用 select *：契约第五节第 11 条规定了对外字段，
  // 不能让数据库多返回什么就漏出去什么。
  params.push([
    'select',
    'id,savings,monthly_expense,name,contact,target_role,updated_at'
  ]);

  // 单行表的锁死名字。常量，不是用户输入。
  params.push(['id', 'eq.profile_singleton']);

  params.push(['limit', '1']);

  const rows = await httpGetJson(restUrl('profile', params));

  // 查不到 → 返回字段齐全的空对象（而不是 404、也不是 null）。
  // 为什么：契约第五节第 11 条要求「永远 200，前端不用判空」。
  if (rows.length === 0) {
    return emptyProfile();
  }
  return toFrontend(rows[0]);
}

/* ============================================================
   第 7 段 · 云函数入口
   ============================================================ */

/**
 * CloudBase 会自动调用它，把返回值当响应发回浏览器。
 *
 * @param event   这次 HTTP 请求的信息。经「HTTP 访问服务」访问时有 httpMethod 等字段
 * @param context 本次调用的运行信息（今天用不到）
 */
exports.main = async (event, context) => {
  const method = (event && event.httpMethod) || 'GET';

  // 今天只认 GET。PUT / POST / DELETE 是第 12 号接口，留 Day 18。
  // 别的方法一律拒掉，而不是「也回一句 ok」—— 回了就是假话。
  if (method !== 'GET') {
    return fail(405, 'method_not_allowed', '这个接口只支持 GET（存参数等 Day 18）');
  }

  // 本接口无查询参数，所以不需要校验段（对比 expenses 的 month / type / limit）。
  // 契约第五节第 11 条明确写「请求参数：无」。

  // 环境变量没配 / 运行时没有 fetch：回 503。用同一个 code，
  // 前端只需要处理一种「稍后重试」。
  if (configError !== '' || !hasFetch) {
    console.error('[profile] 运行配置缺失：'
      + (configError !== '' ? configError : '运行时不支持 fetch，请确认使用 Node.js 18 及以上'));
    return fail(503, 'service_unavailable', '数据库暂时连不上，稍后重试');
  }

  try {
    const data = await queryProfile();
    // 注意：无论表里有没有记录，这里都是 200。
    // 查不到的情况已经在 queryProfile() 内部变成 emptyProfile() 了。
    return ok(data);
  } catch (err) {
    /* --------------------------------------------------------
       网关报错（401 认证 / 403 权限 / 404 表不存在 / 400 语法）、
       网络超时、令牌换不到，都走到这里。

       为什么不把错误详情原样回给浏览器：
         网关的响应体里可能带表结构、列名、内部标识。
         甩到浏览器上等于把数据库结构公开给任何访问这个接口的人
         —— 这是信息泄露，不是「方便排查」。
         而且万一网关报错里掺进了本表的数据（含 contact），
         把它甩出去或写进日志都是红线事故。
         所以只回一句人话，真实原因留在服务端日志，且只记状态码。

       日志只记 err.dbStatus，不记整个 err ——
       err.message 同样可能带地址或结构信息。
       -------------------------------------------------------- */
    console.error('[profile] 查询失败，网关状态码：'
      + (err && err.dbStatus ? err.dbStatus : '无响应或超时'));
    return fail(503, 'service_unavailable', '数据库暂时连不上，稍后重试');
  }
};

/* ----
   下面是本文件依赖契约的逐条对照，写完顺手核一遍：

   契约第二节 · 通用约定
     · 字段名对外不改编 → toFrontend() 只做 monthly_expense→monthlyExpense
       这类**对齐**，不新增不删字段
     · 金额是数字 → Number()，见 toFrontend() ②
     · 🔴 contact 是红线字段 → 只读出本机显示，不外发、不入日志
     · 唯一例外「单行表携带固定 id」→ 本文件返回 id，已由契约第二节
       与第五节第 11 条登记，不是擅自加字段

   契约第五节第 11 条
     · 请求参数：无 ✓
     · 永远 200 ✓（表里没记录也返回 emptyProfile()，不是 404）
     · 字段齐全、值为 null，前端不用判空 ✓
     · 携带固定 id = "profile_singleton" ✓（示例 JSON 里就有这个字段）
     · monthlyExpense 为 null 表示「请前端按近 3 个自然月自动算」✓
     · 错误：405 ✓

   ⚠️ 改造前后**对外行为零变化**：
     入参、字段名、排序规则、状态码、错误码、错误体形状、503 不回传原始报错
     —— 全部逐字未动。变的只有「怎么把数据取回来」这一层。
     api-contract.md v1.4 已在第二节补记这次部署路径调整。
---- */
