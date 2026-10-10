/**
 * 简册 · 前端 API 层（Day 20 新增）
 * ------------------------------------------------------------
 * 干什么：把「页面要数据」这件事，从页面里搬到这一个文件里。
 *
 * 为什么要有这个文件（零基础版）：
 *   之前页面要数据，是直接从浏览器自己的「本地抽屉」里拿的 ——
 *   你在这台电脑上记的账，只有这台电脑看得见，换台设备就是空的。
 *   今天把它改成：**先去云端的数据库问，问到了就显示云端那份**。
 *
 *   「地址」「怎么解析」「失败了怎么办」这些细节全部收在这一个文件，
 *   页面只需要调`getExpenses()` 就拿到数据，读不懂的细节不用看。
 *
 *🔴 密钥纪律（AGENTS.md 第五节第 3 条）：
 *   **前端一个密钥都不放**。这里只有「接口地址」和「网址是谁」，
 *   两者都是公开信息（任何人打开你的网页都能看到）。
 *   真正的令牌（TCB_TOKEN / API Key）只在云函数那边，从不流到这里。
 *
 *   规矩靠一条命令兜住：grep -rn "TCB_\|APIKEY\|SECRET" src/
 *   命中即失败。
 */

/* ============================================================
   第 1 段 · 接口地址（从构建时环境变量读，不写死在代码里）
   ============================================================ */

/**
 * 云函数 HTTP 访问服务的根地址。
 *
 * Vite 会在 `npm run build` 时把`import.meta.env.VITE_*` 替换成真实值，
 * 所以**它必须写完整**（`import.meta.env.VITE_API_BASE || '兜底值'`）——
 * 少写后半截会得到 `undefined`，一 fetch 就报「地址无效」，很难查。
 *
 * 为什么放环境变量而不是直接写在代码里：
 *   换环境（测试 → 正式）、换地域、换域名，都不用改代码，
 *   只改 `.env.production` 里的一行。
 */
const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');

/**
 * 页面当前所在的网址 —— 就是「我是谁」。
 *
 * 用途：把它一起发给接口（通过 Referer / Origin 自动带），让接口知道
 * 这个请求是从你打开的页面发出来的。接口端用它核对白名单。
 *
 * ⚠️ 这不是密钥，也不用于鉴权，纯粹是「报家门」。
 */
export const PAGE_ORIGIN = typeof window === 'undefined' ? '' : window.location.origin;

/**
 * 还没配地址时，页面用哪些假数据顶上。
 *
 * ⚠️ 为什么要留兜底（这是今天一个刻意的设计）：
 *   万一`.env.production` 忘了配、或网络断了、或接口 503，
 *   页面**不能变成一片空白** —— 一片空白会让人以为「代码坏了」。
 *   有兜底时页面照常显示本地那份，并在界面上标一句「当前显示的是本地副本」。
 *
 *   但**兜底数据一律是编造的假数据**（AGENTS.md 附三第 3 条），
 *   绝不能把真实账目写在这里。
 */
export const IS_WIRED = BASE !== '';

/** 从页面地址推出请求地址，拼成完整的 URL */
function url(path) {
  if (!IS_WIRED) return '';
  return BASE + path;
}

/* ============================================================
   第 2 段 · 统一的取数函数
   ============================================================ */

/**
 * 一次 fetch 的全部处理：拼地址 → 发请求 → 读 JSON → 拆壳。
 *
 * @param {string} path       接口路径，例如 '/api/expenses'
 * @param {object} [options]  透传给 fetch 的选项（例如 POST 的 body）
 * @returns {Promise<object>} 解析后的响应 JSON
 * @throws直接抛原始错误 —— 由调用方决定怎么处理（分档提示、回落兜底）
 */
async function request(path, options) {
  const full = url(path);
  if (full === '') {
    throw new Error('接口地址未配置');
  }

  /* ---- 请求头：只在真的要发 JSON 时才带 Content-Type ----
     ⚠️ 这不是省事，是省一次往返（Day 20 实测踩到）：
       浏览器把请求分两档 ——
         「简单请求」：地址对、方法是 GET/POST、头只用了白名单里的那几个（不含
                     `Content-Type: application/json`）→ **直接发，一趟搞定**
         「预检请求」：带了上面那条头（或 PUT/DELETE 等）→ 浏览器**先偷偷发个
                     OPTIONS 问一句「你让吗」，得到答复才发真请求 → **两趟**
       GET 读数据带了 `application/json` 就掉进第二档 ——
       每次读列表都白跑一趟 OPTIONS。
       而 GET 本来就没有请求体，根本不需要声明内容类型。
       → 所以：**有 body 才带，没 body 不带。** */
  const headers = { ...(options && options.headers ? options.headers : {}) };
  if (options && options.body) {
    headers['Content-Type'] = 'application/json';
  }

  // ⚠️ 不加这个字段，同一个网址的结果可能被缓存住，
  //    「改数据库 → 刷新 → 数据没变」就是这么来的。
  const res = await fetch(full, {
    cache: 'no-store',
    ...options,
    headers: headers,
  });

  /* ---- 读响应体（先按文字读，不是直接 res.json()） ----
     ⚠️ 为什么要绕这一步：`res.json()` 对**空正文**会抛错，
     而空正文在删接口上是**正常的成功响应**（见下面 2xx 那一段）。
     先读文字，才能分清「正文是空的」和「正文是一堆看不懂的东西」——
     前者是成功，后者才可疑。 */
  let text = '';
  try {
    text = await res.text();
  } catch {
    text = '';
  }

  let body = null;
  if (text !== '') {
    try {
      body = JSON.parse(text);
    } catch {
      // 不是 JSON：多半是网关/安全中间页拦下了，回来一个 HTML 错误页。
      // 不兜住的话用户看到的是「Unexpected token <」这种天书。
      body = null;
    }
  }

  /* ---- 拆壳：好几种形状都试一遍 ---- */
  // 云函数正常回 { ok, data }；health 回 { ok, service }（形状不同，见下）。
  // 所以这里不假设唯一形状，而是「找到 ok:true 且带 data 的那个」。
  if (body && typeof body === 'object') {
    if (body.ok === true) {
      // health 的形状：ok:true 但没有 data，data 就是它本身
      return body.data !== undefined ? body.data : body;
    }
    // ok 不为真 → 取人话错误
    const msg =
      (body.error && typeof body.error.message === 'string' && body.error.message) ||
      `请求没成功（HTTP ${res.status}）`;
    const err = new Error(msg);
    err.code = body.error && body.error.code ? body.error.code : 'unknown';
    err.field = body.error && body.error.field ? body.error.field : null;
    err.status = res.status;
    throw err;
  }

  /* ---- 2xx，但没有 JSON 正文 = 成功，只是「没什么要说的话」 ----
     ⚠️⚠️ 这一条是 Day 22 本地自测抓出来的**真 bug**，改之前先读完：

     【原来的写法】不判状态码，只要解析不出 JSON 就往下走到「服务暂时不可用」。
     【错在哪】DELETE 成功时正文**本来就是空的**（大量实现回 204 No Content）。
       于是：库里那一行**已经真的删掉了**，前端却收到「服务暂时不可用」，
       于是**保留列表里那一行**、还弹了个失败提示。
       用户看到「删除失败」→ 再点一次删除 → 这次后端说「没有这一条」（404）→
       用户彻底糊涂：到底删掉没有？

     【为什么这类错最难查】动作**真的发生了**，界面却说没发生 ——
       界面和数据库各说各话。刷新一下那一行又不见了，
       用户只会觉得「这软件有鬼」，而我们这边一行报错都没有
       （因为服务端的响应完全正常，是前端自己判错了）。

     【修法】成功与否**看状态码**，不看正文有没有。2xx 且没正文 = 成功、返回 null。
       调用方不需要返回值（删接口的契约本来就只承诺 { ok, id }）。

     ⚠️ 不要把它和「非 2xx 且没有正文」混为一谈 —— 那种仍然算失败，见下面。 */
  if (res.ok) {
    return null;
  }

  // 非 2xx 且没有 JSON 正文：确实出问题了（网关挂了 / 被安全页拦下 / 502…）
  const err = new Error(`服务暂时不可用（HTTP ${res.status}）`);
  err.code = 'service_unavailable';
  err.status = res.status;
  throw err;
}

/* ============================================================
   第 3 段 · 三个接口（契约第 1 / 2 / 11 号）
   ============================================================ */

/**
 * 契约第 1 号：GET /api/health —— 「你还活着吗」
 * @returns {Promise<boolean>} 通=true
 */
export async function getHealth() {
  try {
    const data = await request('/api/health');
    return data.service === 'Ledger and Career' || data.ok === true;
  } catch {
    return false;
  }
}

/**
 * 契约第 2 号：GET /api/expenses —— 读账目流水
 * @param {object} [params] 可选筛选，如 { month: '2026-09' }
 * @returns {Promise<Array>} 账目数组
 */
export async function getExpenses(params) {
  // 空参数不带问号（避免出现 `/api/expenses?` 这种怪地址）
  const qs = params ? new URLSearchParams(params).toString() : '';
  const suffix = qs === '' ? '' : '?' + qs;
  const data = await request('/api/expenses' + suffix);
  // 契约要求是数组；万一网关回了个对象，这里直接判成空数组，
  // 不让 `.filter` 在页面上炸掉
  return Array.isArray(data) ? data : [];
}

/**
 * 契约第 11 号：GET /api/profile —— 读个人参数（单行）
 * @returns {Promise<object>} 个人参数对象
 */
export async function getProfile() {
  const data = await request('/api/profile');
  return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
}

/**
 * 契约第 4 号：POST /api/expenses —— 记一笔（检查台写入测试用）
 *
 * @param {object} row业务字段 { date, amount, type, category, note }
 * @returns {Promise<object>} 服务端生成的完整记录（8 个字段）
 */
export async function createExpense(row) {
  /* ---- clientToken：防重复提交 ----
     零基础版：这是一个「一次性随机串」，作用是**防手快点两下**。
     服务端拿它当主键的一部分，所以同一个串提交两次，
     第二次必然撞主键被拒（409）。不带这个串就不防重。
     格式要求：字母数字下划线连字符，8~40 位（契约第五节第 4 条）。 */
  const clientToken = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  return await request('/api/expenses', {
    method: 'POST',
    body: JSON.stringify({ ...row, clientToken }),
  });
}

/**
 * 契约第 5 号：PATCH /api/expenses/:id —— 改一笔（Day 22 新增）
 *
 * @param {string} id    要改的那一笔的编号
 * @param {object} patch **只放要改的字段**（date / amount / type / category / note）
 * @returns {Promise<object>} 改完之后的完整记录（8 个字段）
 */
export async function updateExpense(id, patch) {
  /* ⚠️ 编号必须 encodeURIComponent：
     它虽然形状受限，但它终究是用户数据的一部分，扔进 URL 前一律转义 ——
     与后端 restUrl() 逐个编码是同一条纪律，**两头都不许省**。
     本文件是服务端之外的另一层，不能指望服务端替我们转义。 */
  return await request('/api/expenses/' + encodeURIComponent(id), {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/**
 * 契约第 6 号：DELETE /api/expenses/:id —— 删一笔（Day 22 新增）
 *
 * @param {string} id 要删的那一笔的编号
 * @returns {Promise<object>} `{ ok: true, id }`（**没有 data**，契约第 6 条如此规定）
 */
export async function deleteExpense(id) {
  // ⚠️ 刻意不带 body、也不带 Content-Type。
  //    带了 Content-Type: application/json 会让这个请求掉进「预检」那一档，
  //    白白多跑一趟 OPTIONS（Day 20 实测踩过，见上面 request() 里的说明）。
  return await request('/api/expenses/' + encodeURIComponent(id), {
    method: 'DELETE',
  });
}

/**
 * 「撤销删除」：把刚删掉的那一条**按原编号**写回去（Day 22 新增）。
 *
 * ⚠️ 这是前端的能力，**不是后端的**。契约第 6 条写得清楚 ——
 *    「后端不做回收站（第 3 周范围外）」。所以撤销 = **重新记一笔**，
 *    只是编号沿用原来那条，这样它在列表里的身份和位置都不变。
 *
 * ⚠️ 为什么编号能原样沿用（这条依赖后端的一个实现细节，必须写明，别让它成为暗知识）：
 *    POST 的主键是 `id = 'ex_' + clientToken`（见后端 buildId()）。
 *    所以只要把**原来那一条的编号**当 clientToken 传回去，
 *    算出来的 id 就还是它 —— 等号两边其实是同一个式子。
 *    ⚠️ 前提：那个编号要符合 clientToken 的白名单（8~40 位，只含字母数字下划线连字符）。
 *      简册的编号是 `ex_` + 时间戳 + 随机串，天然符合。
 *      但**这不是永久保证**：将来若编号规则改了，这里要跟着改
 *      （改法以后端注释为准，去 buildId 看，别只信这一段描述）。
 *
 * ⚠️ 代价（诚实写明）：`createdAt` 会变成**撤销的这一刻**，不是原来那个。
 *    因为服务端认为这是「新记的一笔」，会给它打上新的创建时间。
 *    界面上看不到这个字段（列表只显示 date），但将来若做了
 *    「按创建时间排序」，撤销过的记录会跑到最前面。**这个取舍是拍过板的**：
 *    宁可 createdAt 变新，也不要为了它给后端加一个回收站。
 *
 * @param {object} row 被删掉的那一条（前端手上的完整记录）
 * @returns {Promise<object>} 服务端生成的完整记录
 */
export async function restoreExpense(row) {
  return await request('/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      date: row.date,
      amount: Number(row.amount),
      type: row.type,
      category: row.category,
      note: row.note || '',
      // ⚠️ 用原编号当令牌 → 写回去的 id 与原来完全一致（推导见上方说明）
      clientToken: row.id,
    }),
  });
}

/* ============================================================
   第 4 段 · 一行自检（贴到页面上让人眼见为实）
   ============================================================ */

/**
 * 一行文字说明「现在页面连到哪儿了」。
 * 页面会把它显示出来 —— 这样「请求地址是公网地址」就是**看得见的**，
 * 不需要用户去开 F12 猜。
 */
export function apiOriginLabel() {
  if (!IS_WIRED) return '未配置接口地址（显示本地副本）';
  try {
    return new URL(BASE).host;
  } catch {
    return BASE;
  }
}
