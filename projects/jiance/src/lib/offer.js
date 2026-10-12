/**
 * 简册 · offer 试算（Day 24 新增 · 板块①「钱 × 履历 联动」的核心）
 * ------------------------------------------------------------
 * 干什么：回答那句**别人永远不会告诉你**的话 ——
 *   「你现在存款还能撑 4.2 个月，所以这份降薪 20% 的 offer 该不该接？」
 *
 * 为什么单独成一个文件（而不是写在 Home.jsx 里）：
 *   ① 这是**纯数学**，跟 React 一点关系都没有；
 *   ② 单独成文件就能用 Node 直接跑测试（不依赖浏览器、不依赖界面），
 *      「钱的事」最该被反复验算 —— 算错一个数会让人做错一个人生决定；
 *   ③ 以后换界面、或者搬到别处，这份算法一个字都不用动。
 *
 * ⚠️ 这里**没有 AI**、也不发任何请求。全是四则运算，同样的输入永远同样的输出。
 *    这不是"不够智能"——**钱的事，确定比聪明重要**。
 */

/** 安全线：跑道低于这个月数就算「危险」。3 个月 ≈ 找下一份工作的常见周期。 */
export const SAFE_MONTHS = 3

/** 三档结论 */
export const VERDICT = {
  /** 月薪 ≥ 支出：不靠存款也能活，存款纯是缓冲 */
  SAFE: 'safe',
  /** 每月从存款里掏，但还能撑过安全线 */
  EATING: 'eating',
  /** 每月掏存款，且撑不过安全线 */
  DANGER: 'danger',
}

/**
 * 把一个「月薪」放进你的财务处境里，算出它能撑多久。
 *
 * @param {object} p
 * @param {number} p.savings        存款（元）
 * @param {number} p.monthlyExpense 月均支出（元）—— 作为基准支出
 * @param {number} p.salary         这份工作的月薪（元）
 * @returns {{net:number, selfSustaining:boolean, runway:number|null, verdict:string}}
 *   net            每月净变化：正 = 结余，负 = 从存款里掏
 *   selfSustaining true = 不靠存款也能活（此时 runway 为 null，不是 0）
 *   runway         还能撑几个月（selfSustaining 时为 null）
 *   verdict        三档结论
 */
export function runwayOf({ savings, monthlyExpense, salary }) {
  const net = salary - monthlyExpense

  // 月薪 ≥ 支出 → 现金流不为负，存款不是"跑道"而是"缓冲"
  if (net >= 0) {
    return { net, selfSustaining: true, runway: null, verdict: VERDICT.SAFE }
  }

  const burn = -net // 每月净流出（正数）
  const runway = savings / burn
  return {
    net,
    selfSustaining: false,
    runway,
    verdict: runway >= SAFE_MONTHS ? VERDICT.EATING : VERDICT.DANGER,
  }
}

/**
 * 把一个输入框里的东西变成"能参与计算的数字"。
 *
 * ⚠️ 为什么单独写：界面上拿到的可能是 ''、null、'25-35K'（用户真会这么填）、NaN。
 *    直接进四则运算会得到 NaN，然后 NaN 会一路传染到界面上（显示"NaN 个月"），
 *    而那是**最难查的一类 bug** —— 页面不报错，只是数字变成了一串英文字母。
 *
 * @param {*} v
 * @returns {number|null} 能算就返回数字，不能算返回 null
 */
export function toNumber(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return n
}

/**
 * 完整的 offer 试算。
 *
 * @param {object} p
 * @param {number} p.savings        存款
 * @param {number} p.monthlyExpense 月均支出
 * @param {number} p.offerSalary    offer 月薪（必填）
 * @param {number} [p.currentSalary] 目前月薪（选填；填了才能算降薪幅度与"现在"那一列）
 * @returns {object} 见下方字段说明；缺关键数据时 `ok:false` + `reason`
 */
export function calcOffer({ savings, monthlyExpense, offerSalary, currentSalary }) {
  const s = toNumber(savings)
  const exp = toNumber(monthlyExpense)
  const offer = toNumber(offerSalary)
  const now = toNumber(currentSalary)

  /* ---- 前置：缺了就算不了，如实说缺哪个，不要给一个假数字 ---- */
  if (exp === null || exp <= 0) {
    return { ok: false, reason: '先把「月均支出」填上 —— 没有它算不出跑道。' }
  }
  if (offer === null || offer <= 0) {
    return { ok: false, reason: '先填这份 offer 的月薪。' }
  }
  if (s === null || s < 0) {
    return { ok: false, reason: '先把「存款」填上（还没存钱就填 0）。' }
  }

  /* ---- 三条线 ---- */
  // 打平线：月薪 = 支出，不亏不赚
  const breakEven = exp
  // 安全线：让跑道正好等于 SAFE_MONTHS 的那个月薪
  //   跑道 = 存款 ÷ (支出 − 月薪) ≥ 3  ⟺  月薪 ≥ 支出 − 存款/3
  // ⚠️ 存款很厚时这个值会是**零或负数**（月薪 0 也够撑）→ 夹到 0，
  //    并用 safeLineClamped 标出来，界面上就不会显示"月薪 ≥ -20000"或"低于 ¥0"这种荒唐话。
  //    判据用 `<= 0` 而不是 `< 0`：正好等于 0 时，月薪 0 的跑道正好 3 个月，
  //    也已经"不需要安全线"了，属于同一类。
  const rawSafeLine = exp - s / SAFE_MONTHS
  const safeLineClamped = rawSafeLine <= 0
  const safeLine = Math.max(0, rawSafeLine)

  /* ---- 两个处境各算一遍 ---- */
  const after = runwayOf({ savings: s, monthlyExpense: exp, salary: offer })
  const before = now !== null && now > 0
    ? runwayOf({ savings: s, monthlyExpense: exp, salary: now })
    : null

  /* ---- 降薪幅度（只在给了"目前月薪"、且确实降了的时候才有意义）---- */
  let cutPercent = null
  if (before !== null && now > 0 && offer < now) {
    cutPercent = ((now - offer) / now) * 100
  }

  /* ---- 一句话结论：这就是"别人永远不告诉你的那句话" ---- */
  const money = (x) => '¥' + Math.round(Math.abs(x)).toLocaleString()
  let headline
  if (after.verdict === VERDICT.SAFE) {
    headline = after.net > 0
      ? `接这份 offer，每月还结余 ${money(after.net)} —— 不靠存款也能过，存款纯是缓冲。`
      : '接这份 offer，刚好打平 —— 不靠存款也能过，但存不下钱。'
  } else if (after.verdict === VERDICT.EATING) {
    headline = `接这份 offer，每月要从存款里掏 ${money(after.net)}，`
      + `按现在的存款能撑 ${after.runway.toFixed(1)} 个月（在 ${SAFE_MONTHS} 个月安全线之上）。`
  } else {
    headline = `接这份 offer，每月要从存款里掏 ${money(after.net)}，`
      + `只够撑 ${after.runway.toFixed(1)} 个月 —— 低于 ${SAFE_MONTHS} 个月安全线，`
      + '建议先谈薪或备好下一步。'
  }

  return {
    ok: true,
    reason: '',
    savings: s,
    monthlyExpense: exp,
    breakEven,
    safeLine,
    safeLineClamped,
    before,
    after,
    cutPercent,
    verdict: after.verdict,
    headline,
  }
}

/**
 * 把「还能撑几个月」变成人话（复用于"现在/接了之后"两列）。
 * @param {object} r runwayOf() 的返回值
 * @returns {string}
 */
export function runwayText(r) {
  if (!r) return '—'
  if (r.selfSustaining) return '不靠存款'
  return r.runway.toFixed(1) + ' 个月'
}
