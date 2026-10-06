'use strict';

/* ============================================================
   简册 · 云函数 expenses
   ------------------------------------------------------------
   文件：functions/expenses/index.js
   功能：GET  /api/expenses —— 收支流水「列表读取」（Day 17 上线）
        POST /api/expenses —— 收支流水「记一笔」（Day 18 新增并已公网验证）
   归属：Day 17 建读路径 / Day 18 加写路径
   依据：api-contract.md 第五节第 2 条（GET：200 / 400 / 405 / 503 的全部形状）
        + 第五节第 4 条（POST：201 / 400 / 405 / 409）
        + 第二节通用约定（字段名不改编、日期是文本、金额是正数、type 是中文）

   今天范围：**只加 POST；读路径除两处已批准的 bug 修复外不动。**
           PUT / DELETE（契约第五节第 5/6 条）今天仍然不做，
           用了照样回 405 —— 没做的接口宁可回「不支持」，也不能假装支持。

   ⚠️ 关于「读路径不变」这句话怎么保证（秋鹰师 Day 18 硬要求）：
     GET 分支的入参解析、同样的两条校验、同样的拼 URL、同样的排序、
     同样的 200/400/405/503、同样的错误体形状、同样的 503 文案，
     全部与 Day 17 上线时相同。改动只有这几处，**逐条列明**：
       ① main() 顶部的方法分流（GET 走老路，POST 走新函数，其余 405）
       ② 405 那句文案 + 回显 method 前加白名单（P2，Day 18 修 bug）
       ③ 新增的第 3 段之二 / 4 段之二 / 6 段之二 / 7 段之二四段
       ④ sendGet 的 clearTimeout 位置（P3，Day 17 遗留，QA 批准顺手修）
     Day 18 本地自测里有一组「GET 回归」断言（117 条中的 F 组27 条），
     其中 16 组是拿 git 里Day 17 版**同参数逐字节比对响应体**；
     G5 则是源码级比对，**把批准改的 ②④ 两处抠掉之后**再比其余部分 ——
     所以「除这两处外一字未改」是测出来的，不是嘴上说的。
     五个 bug 的完整留档见文件末尾「Day 18 QA 复验后修的 5 个 bug」。

   ┌─────────────────────────────────────────────────────────────┐
   │ ⚠️ 两条临时诊断入口已删除（Day 18 收尾，定位完成即整块移除）      │
   ├─────────────────────────────────────────────────────────────┤
   │ ① `/_diag`（Day 17 建）—— 定位 GET 的 503。根因是环境变量没配，  │
   │    不是代码问题。已用「改环境变量」解决，探针使命完成。            │
   │ ② `/_wdiag`（Day 18 建）—— 定位 POST 的 401。                  │
   │    根因是**令牌档位用错**：Publishable Key（`TCB_TOKEN`）读得了、 │
   │    写不了，写必须用 API Key（`CLOUDBASE_APIKEY`）。            │
   │                                                              │
   │ 两处都是「打进来才知道」的问题：本地假网关永远测不出，            │
   │ 因为令牌档位与平台鉴权策略是云端事实，不是代码逻辑。             │
   │                                                              │
   │ 【留下的宝贵结论，下次别再踩】                                   │
   │   · 读可用 Publishable Key；**写必须 API Key**。                │
   │   · `resolveToken()` 本来就优先读 `CLOUDBASE_APIKEY`（第 ① 档），│
   │     401 卡了两天是因为**那个环境变量从来没配过**。                │
   │   · API Key 约 900 字符，Publishable Key 约 1166 —— 前者还顺带  │
   │     消除了 Day 17 那个「长 JWT 被控制台截断」的风险。            │
   │   · ⚠️ API Key 绝不能进前端 / 浏览器 / 仓库。                   │
   └─────────────────────────────────────────────────────────────┘

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
/* ----
   Day 19 · 数据访问层已拆出。

   原来第 3/5/6 段（令牌与HTTP 访问、行转前端对象、查库、写库）整块搬到了
   ./expensesRepository.js。本文件现在只做三件事：
     接请求（方法分流 + 参数校验）→ 调 repository 的函数 → 返响应。

   ⚠️ 下面只取 runtime 的「状态」，不碰连接细节：
      configError / hasFetch 用于 503 分档与发请求前的拦截。
      queryExpenses / createExpense 直接起别名，**是为了下面两行调用点一字不改** ——
      拆分就应当是纯搬移，调用点跟着改名的话，回归就没法逐字节比对了。
   ------------------------------------------------------------ */
const repo = require('./expensesRepository');
const configError = repo.runtime.configError;
const hasFetch = repo.runtime.hasFetch;
const queryExpenses = repo.queryExpenses;
const createExpense = repo.createExpense;


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
 * 组装「新建成功」响应。Day 18 新增。
 *
 * ⚠️ 为什么不能直接用 ok()：ok() 把状态码写死成 200，
 *    而契约第五节第 4 条要求「记一笔」回 **201**。
 *    状态码是这份契约里**前端会读**的东西（前端据此判断「是新增成功
 *    还是只是读到了东西」），所以 201 必须真的发出去，不能拿 200 糊弄。
 *    壳的形状（ok / data / error 三字段）与 ok() 完全一致，
 *    前端那套 `if (res.ok)` 判断一行都不用改。
 *
 * @param {*} data 刚写进去、已翻译成前端形状的那一条记录
 */
function created(data) {
  return json(201, { ok: true, data: data });
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

   这一段不是临时的：分档靠的是**状态码语义**（401/403/404/400 各代表什么），
   不依赖任何临时排查手段，可以长期留着。
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
 * ⚠️ 这里**只做翻译，不发任何请求**。这样分层是有意的：
 *    正式路径不该为了「给出原因」多打一次请求 —— 诊断是排查时才做的事，
 *    不该留在每次用户请求的必经之路上。
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
   第 4 段 · 参数校验（读接口）
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
   第 4 段之二 · 写入参数校验（Day 18 新增）
   ------------------------------------------------------------
   读接口的校验（第 4 段）和写接口的校验（这一段）是**两套**，故意不合并：
   读的 month 是一个筛选条件，宽松一点退回默认值还能继续服务；
   写的一笔账是**要落库的正经数据**，填错就是错，必须当场 400 拦住。
   「读可以宽容、写必须严格」是这一段存在的全部理由。

   ⚠️ 为什么要自己校验一遍，不靠数据库的 CHECK 兜着（schema.sql 明明有）：
     CHECK 只能拦住「明显错」的（负金额、错日期格式、分类与 type 错配），
     而且**它拦不住时已经进库流程了**，网关会回一句 400，
     我们还得从那句 400 里反推「是哪一列错了」——而正文不能回传（Day 17 铁律）。
     在门口自己校验，好处有三个：
       ① 能精确告诉前端**哪个输入框**标红（error.field 就是给前端用的）
       ② 一条 400 就带一个准确的 field，不用猜
       ③ 数据库那一层仍然保留 —— 这里是第二道防线，不是替换掉它
   ============================================================ */

/**
 * date 的格式：4 位年 - 2 位月 - 2 位日。
 *
 * 和 MONTH_PATTERN 同一个道理，这里再补一条**读接口没说的**理由：
 * 月份合法不代表日子合法。'2026-02-31'、'2026-13-05'能过正则，
 * 但它们不是日历上存在的一天，存进去之后按月统计会算出一个
 * 用户自己都对不上的数。schema.sql 的 CHECK 只管 `\d{2}-\d{2}` 的形状，
 * 管不到「2 月有没有 31 号」，所以这一层必须多问一句。
 */
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * 每个 type 允许的分类（照契约第五节第 4 条，与 schema.sql 的 CHECK 一字不差）。
 *
 * 用对象而不是两个数组：写入时要**按 type 取那一份**，
 * 写成 `CATEGORIES[type]` 一行就够，天然不会出现「校验了收入的分类、
 * 写进支出的记录」这种错位。
 */
const CATEGORIES_BY_TYPE = {
  '支出': ['餐饮', '交通', '房租', '购物', '医疗', '娱乐', '其他'],
  '收入': ['工资', '兼职', '理财收益', '其他']
};

/** note 的最大长度。schema.sql 里是 varchar(50)，这里是同一条规则的代码侧。 */
const MAX_NOTE_LENGTH = 50;

/**
 * 金额最多两位小数。
 *
 * 为什么卡两位：数据库列是 numeric(12,2)。超过两位的话，
 * 存进去会被**静默四舍五入**（0.005 → 0.01），用户填 12.345 记下来是 12.35，
 * 界面显示的和记下来的对不上，账就越记越糊涂。宁可当场 400 让他改。
 */
const MAX_AMOUNT_DECIMALS = 2;

/**
 * 金额上限：9999999999.99
 *
 * ⚠️⚠️ 这个坑是怎么被发现的（Day 18 修bug 记录）：
 *   原来只校验了「大于 0」和「最多两位小数」，**没管上界**。
 *   QA 传 `10000000000`（1e10）试出来是放行的，然后：
 *     代码放行 → 真库执行 INSERT → 数据库列是 numeric(12,2)，
 *     装不下 → PostgreSQL 回 `numeric field overflow`
 *     → 网关包成 400 → 我们的 catch 把它归成 **503
 *     「数据库暂时连不上，稍后重试」**。
 *
 *   为什么这个结果特别坏：这是一个**永久性错误**（金额填大了，
 *   改小就好），却报成「稍后重试」。用户点一万次也永远不会成功，
 *   只会一直看到「数据库连不上」—— 最后多半以为记账功能坏了而放弃。
 *   **把「你填错了」报成「稍后重试」，是在浪费用户的时间。**
 *
 *   9999999999.99 这个值不是我拍的，是**照抄数据库的定义**：
 *   schema.sql 第 84 行 `amount numeric(12,2)`。
 *   numeric(12,2) = 12 位有效数字、其中 2 位在小数点后，
 *   所以整数部分最多 10 位 → 最大 9999999999.99。
 *   **代码里的上界必须 ≤ 数据库列的上界**，否则就又变成让数据库来报错。
 *   ⚠️ 将来 schema.sql 改了这里也要跟着改，改的时候记得两边一起改。
 *
 *   📌 契约第二节目前只写「数字，正数，最多两位小数」，**没有写上界** ——
 *      补进契约需要秋鹰师拍板，见文件末尾对照注释里的说明。
 */
const MAX_AMOUNT = 9999999999.99;

/**
 * clientToken 的白名单格式。
 *
 * ⚠️ 这一段是**主键防注入的第一层**，理由和 restUrl() 里的两层防线同源：
 *   clientToken 会被编进主键（id = 'ex_' + clientToken），主键是要落库的字符串。
 *   白名单只放「字母、数字、下划线、连字符」，长度 8~40：
 *     · 放行这四种，是因为它们在 URL、JSON、主键里都**不需要转义**，
 *       不会因为某个字符的含义在两层之间不一样而变形；
 *     · 卡上界 40，是防「前端传一个几 KB 的字符串当令牌」把主键撑成长文本；
 *     · 卡下界 8，是防「传一个 1 个字符的 a」——那种令牌区分不开两次提交，
 *       防重等于没有，还不如老实退回服务端自增（见 buildId）。
 *   两层防线的分工和 restUrl() 一样：**这一层表达意图，数据库约束兜底安全**。
 */
const CLIENT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,40}$/;

/** 流水 id 的固定前缀（契约第二节：id 文本，前缀区分表，流水是 ex_）。 */
const ID_PREFIX_EXPENSE = 'ex_';

/**
 * 生成这一笔的主键。
 *
 * ⚠️⚠️ 这是**防重复提交**（秋鹰师 Day 18 亲自拍板 A 方案）的全部实现，
 *    逻辑很短，但每一步都有代价，说清楚免得以后有人「优化」掉：
 *
 * 【要防的问题】
 *   网络卡住时用户以为没点上，手快点两下「保存」。
 *   两次 POST 的内容一模一样，数据库里就多出一笔重复账目。
 *   月度合计多算一笔，月底对账对不上，而且**用户完全看不出来**。
 *
 * 【A 方案：把客户端的一次性令牌编进主键】
 *   id = 'ex_' + clientToken。同一个令牌提交两次 → 主键一样 → 数据库拒绝。
 *   拒绝就是好事：它把「两次插入」在数据库层面压成了一次，不靠任何人的手速。
 *
 * 【为什么用主键而不是「先查一次有没有」】
 *   「先 SELECT 看存不存在，不存在再 INSERT」在并发下有窗口期：
 *   两个请求同时 SELECT 都没查到，然后同时 INSERT —— 照样重复。
 *   主键唯一性是数据库**保证**的，不存在这个窗口。
 *   也就是说：防重的可靠性来自数据库的唯一约束，不是我们代码里的时序运气。
 *
 * 【⚠️ 没有令牌就没有防重（这句话必须写在这里，别让人误以为永远防得住）】
 *   令牌是**客户端生成的**，所以服务端拿不到就是拿不到，无法凭空造出来：
 *     · 令牌合法 → 用它当 id 的后半段 → **防重生效**
 *     · 令牌缺失或空串 → 退回服务端自增 → **这一次没有防重能力**，
 *       用户手快点两下就会记两笔。这不是 bug，是令牌机制的固有边界，
 *       唯一的解法是前端每次点提交都带上 clientToken。
 *       所以下面那条 console.warn 不是「随便打个日志」，它是**防重失效的告警**：
 *       线上日志里如果频繁出现它，说明前端某个版本没在传令牌，该去查前端了。
 *     · 令牌格式不合法 → 走 400（见 validateExpenseInput），不静默降级。
 *       静默降级最坏：用户以为防住了（其实没防住），下次重复了他还纳闷。
 *
 * 【自增部分为什么这么拼】
 *   时间戳（毫秒）+ 8 位随机，两者都从 crypto.randomBytes 取。
 *   为什么要随机：同一毫秒里发两次请求是**会发生的**（前端连点、用户狂点）。
 *   只用时间戳的话那两次会算出同一个 id，第二次被当成重复提交误伤。
 *   为什么要 crypto 而不是 Math.random：主键唯一性靠的就是这几位的不可预测性。
 *   Math.random 是伪随机、可被预测；虽然这里被猜中的后果很轻
 *   （顶多撞掉自己一笔记录），但云函数里用 crypto.randomBytes
 *   是 Node 自带的、不加任何依赖，没有理由不用。
 *   取不到就退回 Date.now + Math.random：宁可在极端情况下降低一点强度，
 *   也不能让「发一笔账」这个最基本的功能挂掉。
 *
 * @param {string|null} token 已通过白名单校验的 clientToken；null 表示没传
 * @returns {string} 可直接落库的主键，形如 ex_a1b2c3d4e5f6 或 ex_1789…_1a2b3c4d
 */
function buildId(token) {
  if (token !== null) {
    /* ⚠️ Day 18 修 bug（双前缀）—— 这个坑是怎么被发现的：
       前端很自然地会传 `clientToken: "ex_myToken0001"`（把 id 的前缀一起带上）。
       CLIENT_TOKEN_PATTERN 放行 ex_（字母、下划线都在白名单里），所以校验通过，
       于是 id 拼成 `ex_ex_myToken0001` —— **前缀出现两次**。
       为什么这不只是「难看」：schema.sql 对 id 列**没有 CHECK 约束**
       （Day 18 建表时只给 date / amount / type·category / 两个时间戳加了 CHECK），
       所以这个脏 id 会**原样落库**，将来任何按 `id like 'ex_%'` 找流水的地方
       都会拿到它，而它其实也是一条合法记录 —— 不一致会一路带下去。
       修法：令牌已经自带前缀就不重复加。
         · 命中就**原样返回 token**（它自己就是完整 id 了）
         · 没命中才补前缀
       ⚠️ 刻意用「以 ex_ 开头」判断而不是「去掉开头的 ex_」再补 ——
          后者会把前端传的 ex_ex_foo 变成 ex_foo，悄悄改掉了对方的值；
          前者一个字节都不动它，只在缺前缀时补齐，行为可预期。
       ⚠️ 这里只判大小写**敏感**的前缀：契约第二节写死前缀是小写 ex_，
          传 Ex_ 开头的应当视为「不同前缀」照常补 ex_，
          否则大小写混用会让「同一令牌」出现两种 id，防重就漏了。 */
    if (token.indexOf(ID_PREFIX_EXPENSE) === 0) {
      return token;
    }
    return ID_PREFIX_EXPENSE + token;
  }

  // ⚠️ 走到这里就是「没有防重能力」的那一次。如实告警，不假装防住了。
  console.warn('[expenses] 本次请求没带 clientToken，本次提交没有防重复保护'
    + '（原因：前端没传，或传了空值）');

  const stamp = String(Date.now());
  let tail;
  try {
    // Node 18 自带 crypto，**不需要在 package.json 里加任何依赖**。
    tail = require('crypto').randomBytes(4).toString('hex');
  } catch (err) {
    // 极端环境兜底：强度略降，但功能不能挂。
    tail = Math.random().toString(36).slice(2, 10);
  }
  return ID_PREFIX_EXPENSE + stamp + '_' + tail;
}

/**
 * 校验一笔要写入的账。
 *
 * ⚠️ 设计上刻意做成**「要么全对、要么返回一个 field」**：
 *   只回第一个错，不一次列出一堆。前端拿到 field 就只标红那一个框，
 *   用户改完再提交。如果一次报五个错，前端要么全标红（满屏红框吓人），
 *   要么自己排优先级（那就等于把校验规则又抄了一遍到前端，早晚会不同步）。
 *
 * @param {object} body 已解析成对象的请求体
 * @returns {{ok:true, value:object}|{ok:false, field:string, message:string}}
 *   value 里是**已经转成数据库列名**的对象，可以直接拿去写库。
 */
function validateExpenseInput(body) {
  /* ---- 请求体本身 ---- */
  // 不是对象（含 null、数组、字符串）都算错。
  // 这里给 field: 'body' 而不是某一个具体字段：错的是「整个请求体」，
  // 挂到 date 头上会让前端去标红日期框，用户完全看不懂哪里错了。
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, field: 'body', message: '请求体格式不对，需要一个 JSON 对象' };
  }

  /* ---- date ---- */
  const rawDate = body.date;
  if (typeof rawDate !== 'string' || !DATE_PATTERN.test(rawDate)) {
    return { ok: false, field: 'date', message: '日期格式必须是 YYYY-MM-DD，例如 2026-09-30' };
  }
  // 形状过了还要问「这天真的存在吗」。'2026-02-31' 能过上面的正则，
  // 但 2 月没有 31 号。放进数据库会静静躺着一笔查不出账目语义的记录。
  // 用 Date 反查一次：把年份月份喂回去，看日号有没有被顺延成 3 月 3 号。
  const y = Number(rawDate.slice(0, 4));
  const m = Number(rawDate.slice(5, 7));
  const d = Number(rawDate.slice(8, 10));
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return { ok: false, field: 'date', message: '日期不存在，请检查月份和日号' };
  }

  /* ---- amount ---- */
  const rawAmount = body.amount;
  if (typeof rawAmount !== 'number' || !Number.isFinite(rawAmount)) {
    return { ok: false, field: 'amount', message: '金额必须是大于 0 的数字' };
  }
  if (rawAmount <= 0) {
    // 契约第二节写死「金额是数字，**正数**」——
    // 收入支出靠 type 区分，不靠正负号，所以 0 和负数都是填错。
    return { ok: false, field: 'amount', message: '金额必须大于 0（收入和支出靠「收入/支出」区分，不靠正负号）' };
  }
  // 小数位判定：「乘 100 之后是不是整数」。
  //
  // ⚠️⚠️ Day 18 修 bug（这个坑是**我自己写的断言 J1 抓出来的**，
  //    不是 QA 报的 —— 加了上界之后，边界值 9999999999.99 被自己的校验误伤了）：
  //
  //   原来的写法是：
  //     const scaled = Math.round(rawAmount * 100 * 1e8) / 1e8;   ← 以为是在「抹掉浮点噪声」
  //     if (Math.abs(scaled - Math.round(scaled)) > 1e-8) → 拦
  //   对 38.555、8.7 这些普通金额确实好使。但 9999999999.99 算出来是：
  //     9999999999.99 * 100 = 999999999999        （正好）
  //     再 * 1e8          = 9.99999999999e19     （⚠️ 已经超过 double 的有效位）
  //     Math.round(...)   = 99999999999900000
  //     / 1e8             = 999999999998.9999    （⚠️ 精度反而被弄坏了）
  //     与整数差 0.000122 > 1e-8 → **合法的边界值被判成三位小数，400**
  //   也就是说：我为了修「上界」而写的测试，暴露了「小数位」这段的量级缺陷。
  //   **一个上界值都不让填，比没有上界更糟** —— 用户填到最大额度时被拒绝，
  //   而错误提示还说「金额最多两位小数」，完全指错方向。
  //
  // 【现在为什么这样写】
  //   容差按**量级**给，而不是给一个固定小数：tol = |scaled| * 2 * Number.EPSILON。
  //   Number.EPSILON = 2.22e-16，是 double 能表示的「相对精度」——
  //   也就是「在这个量级上，浮点自己最多能误差多少」。乘 2 是留一点余量。
  //
  //   为什么这个容差不会把真的三位小数放过去（这是关键，必须算过）：
  //     · 金额已被上界卡在 1e10 以内 → 乘 100 最多 1e12。
  //     · 在 1e12 这个量级上，double 的最小可表示间隔是
  //       2^-52 * 2^40 ≈ 0.000244 —— 这就是「浮点噪声」的量级。
  //     · 而**真的三位小数**，乘 100 之后必然是 k/10（k%10≠0），
  //       离整数**至少 0.1**。
  //     · tol 在 1e12 处 = 0.00044。
  //     → 0.000244（噪声）< 0.00044（容差）< 0.1（真三位小数）
  //     中间差了 200 多倍，两类东西**不可能被这个容差混起来**。
  //
  //   ⚠️ 顺带说明 `0.1 + 0.2 = 0.30000000000000004` 为什么**要放行**：
  //     它在数学上就是 0.3，是**两位小数**，只是 double 存不下 0.3。
  //     前端做加减法之后传过来的值很可能就是这种形态 ——
  //     如果这里拦掉，用户会看到「金额最多两位小数」而完全不知道是自己的
  //     计算链产生的浮点噪声。**拦住它是在惩罚正确的结果。**
  const scaledAmount = rawAmount * 100;
  const tolerance = Math.abs(scaledAmount) * 2 * Number.EPSILON;
  if (Math.abs(scaledAmount - Math.round(scaledAmount)) > tolerance) {
    return { ok: false, field: 'amount', message: '金额最多两位小数' };
  }
  // 上界：数据库列是 numeric(12,2)，装不下超大数字。
  // 不在这里拦的话，数据库会回 numeric field overflow，
  // 我们只能把它归成 503「稍后重试」—— 而这是永久性错误，重试一万次也没用。
  // 完整踩坑记录见 MAX_AMOUNT 的注释。
  if (rawAmount > MAX_AMOUNT) {
    return { ok: false, field: 'amount', message: '金额太大了，最多能记 9999999999.99' };
  }

  /* ---- type ---- */
  const rawType = body.type;
  if (typeof rawType !== 'string' || VALID_TYPES.indexOf(rawType) === -1) {
    return { ok: false, field: 'type', message: '类型只能是「收入」或「支出」' };
  }

  /* ---- category ---- */
  // 顺序很关键：**先确认 type 合法，再按 type 取那一份分类表**。
  // 反过来写会拿到 undefined.indexOf，抛出来的错前端完全看不懂。
  const rawCategory = body.category;
  const allowed = CATEGORIES_BY_TYPE[rawType];
  if (typeof rawCategory !== 'string' || allowed.indexOf(rawCategory) === -1) {
    return {
      ok: false,
      field: 'category',
      message: rawType + '的分类只能是：' + allowed.join('、')
    };
  }

  /* ---- note ---- */
  // 缺省 / null / 未传 都当成「没写备注」→ 存 null。
  // 为什么不是存空字符串：数据库的 null 和 '' 在语义上就是两回事
  // （null = 没填，'' = 填了个空的），而 toFrontend() 会把 null 收成 ''
  // 再给前端，所以对外两种情况长得一样、库里分得清——这是好事，不要抹平。
  let rawNote = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') {
      return { ok: false, field: 'note', message: '备注只能是文字' };
    }
    if (body.note.length > MAX_NOTE_LENGTH) {
      return { ok: false, field: 'note', message: '备注最多 ' + MAX_NOTE_LENGTH + ' 个字' };
    }
    rawNote = body.note;
  }

  /* ---- clientToken（防重复提交） ---- */
  // 三种结果，注释见 buildId()：
  //   · 合法 → 用它当 id 的后半段（防重生效）
  //   · 没传 / 空 → 服务端自生成（**没有防重能力**，日志里会记一笔）
  //   · 传了但格式不对 → 400。这条最容易被写成「忽略它然后自生成」，
  //     那样用户会遇到「我明明传了令牌，你却说是重复提交/或没防住」的糊涂局面，
  //     直接告诉他「令牌格式不对」最省事。
  let token = null;
  if (body.clientToken !== undefined && body.clientToken !== null && body.clientToken !== '') {
    if (typeof body.clientToken !== 'string' || !CLIENT_TOKEN_PATTERN.test(body.clientToken)) {
      return {
        ok: false,
        field: 'clientToken',
        message: '提交标识格式不对（8~40 位，只能用字母、数字、下划线或连字符）'
      };
    }
    token = body.clientToken;
  }

  const now = new Date().toISOString();

  return {
    ok: true,
    value: {
      id: buildId(token),
      date: rawDate,
      // 统一保留两位：numeric(12,2) 存进去本来就是两位，
      // 前端拿到 38.5 和 38.50 是同一个数，但回传形状要稳定，所以写死 toFixed(2) → Number。
      // ⚠️ 用 Number(...) 包一层：toFixed 返回的是字符串 "38.50"，
      //    直接写进 JSON 会让前端拿到字符串，契约第二节写的是「数字」。
      amount: Number(rawAmount.toFixed(MAX_AMOUNT_DECIMALS)),
      type: rawType,
      category: rawCategory,
      note: rawNote,
      created_at: now,
      updated_at: now
    }
  };
}

/* ============================================================
   第 7 段之二 · 写入处理（POST /api/expenses）—— Day 18 新增
   ------------------------------------------------------------
   契约第五节第 4 条。成功 201，body 形状与第 2 条里的一项**完全一致**
   （这一点很重要：前端「记完一笔立刻把这笔显示在列表里」时，
   追加进去的对象和 GET 读回来的对象必须是同一个形状，
   否则前端要写两套取值代码。复用 toFrontend() 就是为了从根上保证这一点）。

   400 的四种触发条件（契约第五节第 4 条的错误表）全部在
   validateExpenseInput() 里判（带 field、中文 message），本段只负责
   把判定结果翻译成响应、以及把真正写库这一步的错误兜住。
   ============================================================ */

/**
 * 处理 POST /api/expenses。
 *
 * 完整流程一共五步，每一步都可能提前返回：
 *   ① 读请求体 → ② 解析 JSON → ③ 校验（400）→ ④ 写库（201/ 409 / 503）→ ⑤ 翻译成前端形状
 *
 * @param {object} event 这次 HTTP 请求的信息
 * @returns {Promise<object>} CloudBase 集成响应
 */
async function handleCreate(event) {
  /* ---- ① 读请求体 ---- */

  /* ⚠️ 关于 CloudBase 怎么把请求体递进来（踩过才知道的）：
     经「HTTP 访问服务」进来时，event.body 是一段 **JSON 字符串**，
     不是对象。直接在 event.body.date 上取属性会拿到 undefined，
     然后被当成「date 没填」回 400 —— 错得莫名其妙。
     而直接调函数测试时（比如控制台的「测试」按钮），body 可能已经是对象了。
     所以两种都要认，见下面 parseRequestBody()。 */
  const parsed = parseRequestBody(event);

  if (parsed.error !== null) {
    // 401 那条这里用不上（网关不会在解析请求体之前就拒绝），
    // 400 也不是契约第五节第 4 条列的那四种之一，
    // 但**必须**有一句能回的话：body 不是合法 JSON 时不能让它变成 500。
    // 字段名给 'body'，提示「整体格式不对」—— 挂到 date 上会误导前端标红日期框。
    return fail(400, 'bad_request', parsed.error, 'body');
  }

  /* ---- ③ 校验 ---- */

  const checked = validateExpenseInput(parsed.value);

  if (checked.ok === false) {
    // 每条 400 都带 field（契约第二节：field 给前端标红对应输入框）。
    // message 是我们自己写死的中文常量，不含任何用户输入 ——
    // 把用户填的内容拼回 message，等于把用户输入原样反射回浏览器，
    // 前端一般会直接渲染它，属于反射型 XSS 的经典入口。
    return fail(400, 'bad_request', checked.message, checked.field);
  }

  /* ---- 写库前先确认运行环境 ---- */

  // 和 GET 路径同一个判断、同一句 503。写接口没有理由比读接口更宽容：
  // 没配环境变量就 POST，除了报 503 什么也做不了。
  if (configError !== '' || !hasFetch) {
    console.error('[expenses] 写入前检查到运行配置缺失：'
      + (configError !== '' ? configError : '运行时不支持 fetch，请确认使用 Node.js 18 及以上'));
    return fail(503, 'service_unavailable', unavailableMessage(translateReason(null)));
  }

  /* ---- ④ 真正写库 ---- */

  try {
    const saved = await createExpense(checked.value);
    // 到这里这笔账**已经在库里了**。日志里不记金额、分类、备注 ——
    // 全是用户自己的账，记进日志等于把账目抄一份到平台的日志系统里。
    // 只记一笔「写成功」，排错时知道「写进去了」就够。
    console.log('[expenses] 已写入一笔记录');
    return created(saved);
  } catch (err) {
    /* --------------------------------------------------------
       三类错误，三种回法：

       ① duplicate —— 同一个 clientToken 第二次提交，撞主键。
          回 **409 + 固定中文**。这个状态码**不在契约第五节第 4 条的错误表里**
          （那里只列了 400 / 405），是 Day 18 为了「防重复提交」补的，
          契约需补一行（见文件末尾的对照注释）。前端不用改：
          它本来就要先判 res.ok，409 会被当成「不成功」，再读 message 提示用户。

          ⚠️ message 是**我们自己写死的一句中文**，不含任何来自网关的内容 ——
          Day 17 铁律在这里同样成立：绝不回传网关响应体（可能带表结构、列名）。
          状态码 409 只说明「重复」，别的什么都不说明，泄露不了什么。

       ② 其它一切失败（401 令牌 / 403 权限 / 404 表不存在 / 网络超时 / 响应形状异常）
          统统回 503，与 GET 路径完全一致 —— 前端只需要处理一种「稍后重试」。

       ⚠️ 日志纪律与 GET 路径相同：
         只记 dbStatus（状态码）与 err.name（错误类），
         **不记 err.message**（带域名 / IP / 端口）、**不记 err 整个对象**
         （上面的字段将来可能增加）。
       -------------------------------------------------------- */
    if (err && err.duplicate) {
      console.log('[expenses] 命中防重复：同一个提交标识第二次到达，已按409 处理'
        + '（网关状态码=' + (err.dbStatus ? err.dbStatus : '无') + '）');
      return fail(409, 'duplicate_submission', '这笔已经记过了，没有重复添加');
    }

    console.error('[expenses] 写入失败：网关状态码='
      + (err && err.dbStatus ? err.dbStatus : '无响应或超时')
      + '，错误名='
      + (err && err.name ? err.name : 'Error')
      + '，分档=' + translateReason(err));
    return fail(503, 'service_unavailable', unavailableMessage(translateReason(err)));
  }
}

/**
 * 把 event 里的请求体变成一个对象。
 *
 * ⚠️ 为什么要单独一个函数：请求体有两种可能形态，各平台的默认值还不一样。
 *   CloudBase「HTTP 访问服务」给的是 **base64 编码的字符串**
 *   （凭据里带 `isBase64Encoded: true`），控制台的「测试」按钮给的可能是
 *   **已经解析好的对象**。两种都认，代码才既能在公网跑、也能在控制台里点。
 *
 *   最怕的写法是 `event.body || {}` 之后直接读 `.date`：
 *   字符串 '{...}' 读 .date 得到 undefined，看起来像「用户没填日期」，
 *   于是回一句「日期格式必须是 YYYY-MM-DD」—— 用户完全不知道自己哪里错了。
 *
 * @param {object} event
 * @returns {{value:object|null, error:string|null}} 二选一
 *   error 非空时，value 一定是 null；error 是**我们自己写死的中文**，不含用户输入
 */
function parseRequestBody(event) {
  const raw = event ? event.body : null;

  // 完全没有 body（前端空 POST）：当成「什么也没填」，
  // 交给 validateExpenseInput 去报第一个字段的 400，
  // 而不是在这里笼统回一句「请求体不能为空」——
  // 那样用户只知道整个请求坏了，不知道该改哪一格。
  if (raw === undefined || raw === null || raw === '') {
    return { value: {}, error: null };
  }

  // 形态一：已经是对象（控制台测试 / 某些调用方式）
  if (typeof raw === 'object') {
    return { value: raw, error: null };
  }

  // 形态二：字符串。先看是不是 base64
  let text = String(raw);
  if (event && event.isBase64Encoded) {
    try {
      text = Buffer.from(text, 'base64').toString('utf8');
    } catch (err) {
      return { value: null, error: '请求体解析失败，请重新提交' };
    }
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { value: null, error: '请求体格式不对，需要一个 JSON 对象' };
    }
    return { value: parsed, error: null };
  } catch (err) {
    // JSON.parse 抛出来的 err.message 会带上原文片段，
    // 绝不能回传（既泄露用户输入，又可能带 HTML）。只回一句固定中文。
    return { value: null, error: '请求体格式不对，需要一个 JSON 对象' };
  }
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

  /* ------------------------------------------------------------
   ⚠️⚠️ Day 18 的唯一一处 GET 行为改动，就是下面这 5 行。

   改前：只认 GET，其它一律 405。
   改后：GET 走读（原样，一字未改）／ POST 走写（新增）／ 其它仍 405。

   为什么 PUT / DELETE 今天还回 405：
     它们是契约第五节第 5/6 条，Day 18 清单里明确「今日不做」。
     宁可回一句「不支持」，也不能「先放进去看看」——
     放进去等于给前端一个能过、能用、但语义不确定的假接口，
     将来真正实现 PUT 时前端已经按假行为写了代码，回改动的是前端。

   ⚠️ 关键纪律：**GET 分支必须保证在其它分支之前分流出去**。
      如果写成「先读 method，等确定了不是 GET 再判 POST」，
      中间任何一次对 GET 路径的改动都可能连带影响 POST，反之亦然。
      两路从第一行就分开，是防串味最省事的办法。
   ------------------------------------------------------------ */

  // —— 写：POST /api/expenses（契约第五节第 4 条）——
  if (method === 'POST') {
    return handleCreate(event);
  }

  // 读：GET /api/expenses（契约第五节第 2 条）。
  // ↓↓↓ 从这一行往下到函数结束，与 Day 17 上线版**逐字相同**（Day 18 只在它上面加分流）
  if (method !== 'GET') {
    /* ⚠️ Day 18 修 bug：这里原来直接 `+ method`，把 httpMethod **原样拼进响应**。
       那是一个反射面 —— 原则是「不把原始输入甩给用户」（AGENTS.md 附三第 6 条的同一口径）。
       现在过一道白名单：只放行「字母和连字符、1~20 个字符」的方法名
       （GET / POST / PUT / DELETE / PATCH / HEAD / OPTIONS / 自定义动词都能过），
       其它一律换成「该方法」三个字。
       ⚠️ 代价几乎没有：真的方法名全部照常回显（对用户有用，前端会读它），
          只有畸形的 method 才被替换 —— 而畸形 method 本来也没法回显。
       ⚠️ 刻意**不删**「不支持 X」那半句：它是有用的信息（前端能读 method），
          这次只把「值」换成可信的。 */
    const safeMethod = /^[A-Za-z-]{1,20}$/.test(method) ? method : '该方法';
    return fail(405, 'method_not_allowed', '这个接口只支持 GET（读列表）和 POST（记一笔），不支持 ' + safeMethod);
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

   ============================================================
   ⚠️⚠️ Day 18 补记 · 契约第五节第 4 条（POST /api/expenses）
   ============================================================

   契约第五节第 4 条
     · 请求体 { date, amount, type, category, note } ✓
     · id / createdAt / updatedAt **由服务端生成，前端传了也忽略** ✓
       （本地实测断言 A6：故意传 id / createdAt / updatedAt 进去，
         回来的仍是服务端生成的值）
     · 成功 **201** ✓（created()，与 ok() 形状相同、只改状态码）
     · 成功体 = 第 2 条里的一项，**完全一致** ✓
       （两边都过 toFrontend()，所以「记完立刻显示」时前端不用写第二套取值）
     · 400 date 格式不对（带 field: date）✓
     · 400 amount 不是大于 0 的数字 / 超过两位小数（带 field: amount）✓
     · 400 type 不是收入或支出（带 field: type）✓
     · 400 category 不在该 type 对应的选项里（带 field: category）✓
     · 405 用了 PUT / DELETE ✓
     · 分类合法值：支出 = 餐饮/交通/房租/购物/医疗/娱乐/其他；
       收入 = 工资/兼职/理财收益/其他 ✓（CATEGORIES_BY_TYPE，与 schema.sql 一致）

   ⚠️⚠️【契约需补第4 行】amount 的**上界** 9999999999.99：
     契约第二节目前只写「数字，正数，最多两位小数」，**没有写上界**。
     但数据库列是 numeric(12,2），装不下更大的数，所以代码必须卡：
       · 超过 → 400 / field: "amount" /「金额太大了，最多能记 9999999999.99」
       · 9999999999.99 恰好**放行**（不是 9999999999.98）
     为什么这条值得进契约：它现在是一条**用户可见的 400**，
       前端要能对它做提示（虽然 field 已经够用了）。
     数字不是我拍的，是照抄 schema.sql 第 84 行的 `amount numeric(12,2)`。
     **代码里的上界必须 ≤ 数据库列的上界** —— 将来 schema.sql 改了这里要跟着改。
     ⚠️ 这条要请秋鹰师拍板：上界也可以改成「不卡上界、让数据库报错」，
       但那样用户会看到 503「稍后重试」而实际是永久性错误（填大了改小就好），
       点一万次也没用 —— 我认为卡上界明显更好，但这属于对外约定的变更。

   ⚠️⚠️【契约需补一行】409 —— 这是**超出契约的补充**，如实写明：
     契约第五节第 4 条的错误表目前只列了 400 与 405，**没有 409**。
     409 是为了「防重复提交」（秋鹰师 Day 18 拍板 A 方案）才加的：
       触发：同一个 clientToken 第二次提交 → 主键冲突
       code：duplicate_submission
       message：这笔已经记过了，没有重复添加
     为什么值得单独占一行而不是塞进 400：
       400 的语义是「你填错了，改一下」；409 的语义是「**已经存过了**」。
       前端对这两者的处理完全不同 —— 400 要标红输入框让用户改，
       409 只需弹一句「已经记过了」然后把列表刷新。
       混成 400 会让用户以为是自己填错了，去反复检查一个本来没错的表单。
     另有两处也是契约外的**保守扩展**，一并写明：
       ① field: 'body' —— 请求体不是合法 JSON / 不是对象时用。
          契约没列这一条，但必须有话说，否则会掉成 500。
       ② field: 'clientToken' —— 令牌格式不合法时用。
          同样是为了不静默降级（静默降级 = 假装防住了）。
     这三处**都不改任何已有约定**，只是把「原来会掉进 500 的情况」
     和「需要新增的业务结果」显式登记。契约补完后本段即可删。

   ⚠️ Day 18 对 GET 路径的影响：**只有两处，且都是 QA 复验后批准修的 bug**。
     ① main() 顶部的方法分流（GET 走读 / POST 写 / 其余 405）—— 这是加功能
     ② 405 那句文案（因为现在多支持了一个方法）+ 回显 method 前加白名单过滤
     ③ sendGet 的 clearTimeout 位置（P3，见下）
     GET 分支从分流那一行往下，除上面 ②③ 外与 Day 17 上线版**逐字节相同**
     —— 这条不是「看着没变」，是本地自测里 F 组（27 条断言，含 16 组
     与 git 里 Day 17 版**同参数逐字节比对响应体**）+ G5（源码尾部比对，
     已把批准的两处抠掉后再比）跑出来的。

   ============================================================
   ⚠️⚠️ Day 18 QA 复验后修的 5 个 bug —— 逐条留档
   ------------------------------------------------------------
   这一段是「修 bug 记录」，写下来有两个用处：
     ① 后来的人能知道**这些坑是被怎么发现的**，下次别再踩；
     ② 改动看起来「只是收窄了几个词 / 加了个判断」时，
        能查到当初**为什么**要这么改，而不是当成多余的防御给删了。
   ------------------------------------------------------------

   ①【P0】唯一冲突误判 → 数据库故障被报成「已经记过了」（最严重）
      位置：looksLikeUniqueViolation() + sendWrite() 的失败分支
      原写法：6 个宽泛关键词，且**没有状态码门槛**。
      怎么发现的：QA 逐个造假正文，6/6 全被误判。最致命的一条是
        网关回 500 + `{"code":"42P07","message":"relation \"expenses\" already exists"}`
        → 42P07是 duplicate_table（**表**已存在），与「这一行 id 重复」无关，
        但 `already exists` 命中了 → 回 409「已经记过了」。
      为什么这个后果最坏：数据库挂了/表被误删/权限掉了 → 用户界面说「已经记过了」
        → 前端按 duplicate_submission 分支弹提示并**刷新列表**
        → 用户以为记成功了，实际库里一行都没有。**静默丢数据 + 错误告知。**
      修法：① 关键词收窄到只剩 23505 与完整句
              「duplicate key value violates unique constraint」
            ② 加状态码门槛 isUniqueConflictStatus()：只放行 400 / 409 / 422，
              **5xx 一律不算**（5xx 是服务端自己的问题，不是用户重复提交）
            ③ 5xx 时**连正文都不读**（读了就有诱惑去用它）

   ②【P1】201出口没校验字段齐全 → 回给前端一份残缺对象
      位置：httpWriteJson()
      怎么发现的：QA 造「201 + 残缺元素」「201 + [123]」等响应，全部回201。
      为什么这个后果坏：**这一笔是真的写进库了**，但回给前端的是残缺对象，
        前端追加进列表显示成「undefined 元」，界面和数据库**永久对不上**，
        而我们回的是 201「成功」，任何地方都查不出错误。
      修法：出口按**数据库列名**（created_at，不是驼峰）校验 8 个字段齐全，
        元素必须是对象且非 null，缺任一 → 抛错走 503。

   ③【P1】amount 没有上界 → 永久性错误被报成「稍后重试」
      位置：validateExpenseInput()
      怎么发现的：QA 传 10000000000，放行了。真库 numeric(12,2) 装不下
        → numeric field overflow → 网关 400 → 我们归成 503「稍后重试」。
      为什么坏：这是**永久性错误**（金额改小就好），点一万次也没用。
        **把「你填错了」报成「稍后重试」是在浪费用户的时间。**
      修法：加 MAX_AMOUNT = 9999999999.99（照抄 schema.sql 的 numeric(12,2)），
        超了 400 / field: amount。契约需补这一行，见上文。

   ④【P2】两处小的
      · 405 文案直接回显 httpMethod → 加白名单过滤（不违规方法名换成「该方法」）。
        Day 18 新增了一个外部输入反射面，AGENTS.md 的口径是「不把原始输入甩给用户」。
      · buildId() 双前缀：前端传 clientToken: "ex_xxx" → id 落成 ex_ex_xxx。
        schema.sql 对 id 列**没有 CHECK**，脏 id 会直接落库。改成自带前缀就原样返回。

   ⑤【P3】超时管不到读正文 → 函数可能永久挂死（Day 17 遗留，顺手一起修）
      位置：sendGet() + sendWrite()
      怎么发现的：QA 实测「网关只回响应头、正文卡住」时 2 秒内既没回 201 也没回 503。
      原因：fetch() 只在**收到响应头**时就resolve，clearTimeout 在它的 finally 里
        就清了，而读正文（resp.json()）在它之后 —— 那时已经没有任何东西能打断读正文。
      修法：clearTimeout 挪到覆盖「取头 + 读正文」整体的外层 finally。
      ⚠️ 读路径挂死比写路径更该修：读挂死是**列表永远转不出来**，
        连已有的账都看不到；写挂死是这一笔没记上。
      📌 验证方式：假网关必须 res.flushHeaders()。不 flush 的话 Node 会缓冲住
        响应头不发出去，fetch() 自己就挂住，那测的是「取响应头超时」
        而不是「读正文超时」—— **修好 P3 也照样会「通过」，等于白测。**
        （这个坑我自己踩了一次：L1 第一版是假通过的，加上 flushHeaders
          后耗时从「立刻返回」变成 8007ms，才是真的走超时路径。）

   ⚠️ 防重复提交的能力边界（写在这里，别让人误以为永远防得住）：
     令牌由**客户端**生成，服务端拿不到就造不出来。
       · 带了合法 clientToken → 防重生效（撞主键 → 409）
       · 没带 / 带空串 → **这一次没有防重**，退回服务端自增 id，
         并在日志里打一条 warn（实测会打，见 buildId）。
         唯一的解法是前端每次点提交都带上 clientToken。
     ⚠️ 机制固有边界（**不是 bug，不要试图「修」**）：
       PostgreSQL 文本主键**区分大小写**，所以 `Day18Token01` 与
       `day18token01` 是两个不同令牌、算两次提交。这是主键机制本身的性质，
       唯一的解法是前端**每次生成随机令牌**（不要用可预测的固定串）。
     详见 buildId() 的完整说明。
---- */