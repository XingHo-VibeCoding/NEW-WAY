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
/* ----
   Day 19 · 数据访问层已拆出。

   原来第 3/5/6 段（令牌与 HTTP 访问、行转前端对象、查库）整块搬到了
   ./profileRepository.js。本文件现在只做三件事：
     接请求（只认 GET）→ 调 repository 的函数 → 返响应。

   ⚠️ 下面只取 runtime 的「状态」，不碰连接细节。
      queryProfile 起别名，**是为了第 7 段那行调用点一字不改** ——
      拆分应当是纯搬移，调用点跟着改名就没法逐字节比对了。
   ------------------------------------------------------------ */
const repo = require('./profileRepository');
const configError = repo.runtime.configError;
const hasFetch = repo.runtime.hasFetch;
const queryProfile = repo.queryProfile;


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
   第 2 段之二 · 503 失败原因分档（Day 23 新增 · 从 expenses 搬过来）
   ------------------------------------------------------------
   为什么今天补这一段：同一个项目里，「数据库连不上」这件事
   两个函数原来**有两种说法** ——
     · expenses：`数据库暂时连不上，稍后重试（网关返回 403，权限不足）`
     · profile ：`数据库暂时连不上，稍后重试`  ← 只到这里，后面什么都没有
   于是排查同一个故障时，读 expenses 的日志能直接看出是权限问题，
   读 profile 的日志只能看出「连不上」，还得再猜一轮。
   **同一件事有两种说法，就会有两种理解** —— 这就是要统一的原因。

   ⚠️ 本段的代码与 expenses/index.js 第 2 段之二**逐字一致**（只改了函数
      上面的说明文字，因为两个函数的处境不同）。要改一起改，别只改一边。
      📌 两处不一致时，排查的人会以为「两个函数坏的原因不一样」，反而误导。

   ⚠️ 三条铁律（照抄 expenses 那一段，忘了就是安全事故）：
     ① 状态码可以带出去 —— 401 / 403 / 404 / 400 是公开的 HTTP 语义。
     ② **绝不带**：令牌原文或片段、数据库密码、host:port、内网 IP、
        响应体正文、表结构与列名。
     ③ 前端只认 error.code（契约规定），多出来的这段是给**日志和截图**看的。
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
 * ⚠️ 这里**只做翻译，不发任何请求** —— 诊断不该留在用户请求的必经之路上。
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

  // 没有状态码 = 没收到 HTTP 响应。
  //   AbortError = 我们自己的超时打上来的
  //   其它 = DNS 解析失败 / 出网被拦 / 连不上
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
  //
  /* ⚠️ Day 23 统一 405 文案（三个函数同句式）：
     以前这里写的是「这个接口只支持 GET（存参数等 Day 18）」——
     那是**写给自己的进度备注**，不是给用户看的提示：Day 18 早就过完了，
     而用户根本不知道「存参数」是哪一年的事。
     现在统一成与 expenses / health 一样的句式：
       这个接口支持 <方法（这句注解）>；不支持 <X>
     并加白名单过滤 —— ⚠️ 回显 httpMethod 是一个**反射面**，
     畸形的方法名一律换成「该方法」（Day 18 在 expenses 上踩过同一个坑）。 */
  if (method !== 'GET') {
    const safeMethod = /^[A-Za-z-]{1,20}$/.test(method) ? method : '该方法';
    return fail(405, 'method_not_allowed',
      '这个接口支持 GET（读个人参数）；不支持 ' + safeMethod);
  }

  // 本接口无查询参数，所以不需要校验段（对比 expenses 的 month / type / limit）。
  // 契约第五节第 11 条明确写「请求参数：无」。

  // 环境变量没配 / 运行时没有 fetch：回 503。用同一个 code，
  // 前端只需要处理一种「稍后重试」。
  if (configError !== '' || !hasFetch) {
    console.error('[profile] 运行配置缺失：'
      + (configError !== '' ? configError : '运行时不支持 fetch，请确认使用 Node.js 18 及以上'));
    return fail(503, 'service_unavailable', unavailableMessage(translateReason(null)));
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
         所以只回一句人话 + 一个**分档原因**，真实细节留在服务端日志。

       ⚠️ 日志纪律：**只记 err.dbStatus（状态码）和 err.name（错误类）**，
         **不记 err.message**（它带域名、IP、端口）、**不记 err 整个对象**。
         Day 23 起多记一个「分档」—— 它和我们回给用户的那段是同一个来源，
         截图/日志对得上，排查时不用再猜。
       -------------------------------------------------------- */
    console.error('[profile] 查询失败：网关状态码='
      + (err && err.dbStatus ? err.dbStatus : '无响应或超时')
      + '，错误名='
      + (err && err.name ? err.name : 'Error')
      + '，分档=' + translateReason(err));
    return fail(503, 'service_unavailable', unavailableMessage(translateReason(err)));
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