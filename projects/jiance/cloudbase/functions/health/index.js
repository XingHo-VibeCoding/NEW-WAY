'use strict';

/* ============================================================
   简册 · 云函数 health
   ------------------------------------------------------------
   干什么：一个「你还在吗」的应答口。
           浏览器打开 https://{域名}/api/health ，它回一段固定 JSON。

   今天范围（Day 15）：只有 GET /api/health。
           不连数据库、不读写任何业务数据、不调大模型。

   它的位置：这是简册的第一个后端接口，也是唯一一个「不碰数据」的接口，
           所以拿它当探路石 —— 地址通了，说明「云函数 + 域名 + 路由」
           这条链是通的，第 3 周往里加真接口就有了地基。
   ============================================================ */

/**
 * 组装 CloudBase 认得的「集成响应」。
 *
 * 为什么要单独写这个函数：返回值里一旦出现 statusCode 字段，
 * CloudBase 就不再自动包装，而是把 statusCode / headers / body
 * 当成 HTTP 响应的状态码、响应头、响应体原样发出去（body 必须是字符串）。
 * 好处是状态码由我们说了算 —— 以后要回 400 / 404 / 405 都靠它。
 *
 * @param {number} statusCode HTTP 状态码
 * @param {object} payload    要回给浏览器的数据（会被转成 JSON 文字）
 */
function json(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // 健康检查不该被缓存：每次问，都该真的问一次
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(payload)
  };
}

/**
 * 云函数入口。CloudBase 会自动调用它，把返回值当响应发回浏览器。
 *
 * @param event   这次 HTTP 请求的信息。经「HTTP 访问服务」访问时，里面有
 *                path / httpMethod / headers / queryStringParameters / body
 * @param context 本次调用的运行信息（今天用不到）
 */
exports.main = async (event, context) => {
  const method = (event && event.httpMethod) || 'GET';

  /* 今天只认 GET。其它方法（POST / PUT / DELETE）一律拒掉，
     而不是「也回一句 ok」—— 回了就是假话，前端会被误导。

     ⚠️ Day 23 两处统一（和 expenses / profile 对齐，同一个项目不许两种说法）：
       ① 文案改成同一句式：`这个接口支持 <方法（一句注解）>；不支持 <X>`。
          以前那句是「请用浏览器直接打开（不要用 POST）」——
          那是**给开发者看的操作指导**，不是给用户看的错误说明
          （用户要的是「我这次请求哪里不对」，不是「你该去哪打开」）。
          ⚠️ 并且加了白名单过滤：回显 httpMethod 是一个**反射面**，
          畸形的方法名一律换成「该方法」（Day 18 在 expenses 上踩过同一个坑）。
       ② 失败体补上 `data: null`。以前这里是 `{ ok, error }` 两字段，
          而 expenses / profile 回的是 `{ ok, data, error }` 三字段
          —— 第二节 v1.2 定的规矩就是「失败体统一三字段、data 恒为 null」，
          本文件当时漏改了。前端两种都能读，但**口径只能有一种**。 */
  if (method !== 'GET') {
    const safeMethod = /^[A-Za-z-]{1,20}$/.test(method) ? method : '该方法';
    return json(405, {
      ok: false,
      data: null,
      error: {
        code: 'method_not_allowed',
        message: '这个接口支持 GET（问一句「服务还在吗」）；不支持 ' + safeMethod
      }
    });
  }

  // 成功。字段一字不多、一字不少，与 api-contract.md 登记的形状完全一致。
  // 注：'Ledger and Career' 是接口返回值（任务指定），不是文档里对项目的称呼 ——
  // 文档和代码注释里本项目一律叫「简册」（AGENTS.md 附三第 2 条）。
  return json(200, {
    ok: true,
    service: 'Ledger and Career'
  });
};

/* ----
   备选写法（只有当平台把上面的响应吐成奇怪结构时，才整段换成这个）：

   CloudBase 也支持「非集成响应」——直接返回一个普通对象，
   平台自动转成 200 + application/json，浏览器看到的 JSON 一模一样。

     exports.main = async (event) => {
       return { ok: true, service: 'Ledger and Career' };
     };

   代价：这样就没法自己指定状态码，上面 405 那段就保不住了。
---- */
