/**
 * 简册 · 今日额度（Day 24 新增 · 板块③「AI 财务管家」的算数部分）
 * ------------------------------------------------------------
 * 干什么：回答「**我今天最多还能花多少**」。
 *
 *   本月额度 − 本月已花
 *   ──────────────────────  =  今天还能花多少（上限）
 *      本月剩余天数（含今天）
 *
 * 【为什么这一步不做成 AI】"该花多少"是**算术**，不是判断。
 *   AI 算这个只有两个结果：算得慢、还算不准。真正需要 AI 的是**解读**：
 *   「你这周为什么超了」「离发薪日还有 9 天，按现在速度会差多少」——
 *   那部分见板块③的界面文案（或后续的 AI 解读通道）。
 *
 * 【口径：上限，不是建议】秋鹰师 2026-10-12 拍板。
 *   所以超过了要**明确预警**，不是软提醒 —— 「我能不能买这个」需要一个硬数字。
 *
 * ⚠️ 没有"按本月已花做近似"这种兜底。理由：本月已花是**已经发生的**，
 *    拿它当额度会算出"剩下的日子一分不能花"，那是荒谬的。
 *    没填月均支出就**明确让他去填**，别给一个假数字。
 */

/**
 * 某个月有多少天。用「下个月的第 0 天」这个技巧拿到月末日期，
 * 闰年 2 月会自动正确（不用自己写 28/29 的判断）。
 * @param {Date} d
 */
export function daysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

/** 本地日期 → `YYYY-MM-DD`（不能用 toISOString，那是 UTC，晚上会差一天） */
export function ymd(d) {
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

export const BUDGET_VERDICT = {
  /** 今天还有额度，且本月没超 */
  OK: 'ok',
  /** 本月没超，但今天已经花超了当日上限 */
  OVER_TODAY: 'over-today',
  /** 本月整月预算已超 —— 当日上限为 0 */
  OVER_MONTH: 'over-month',
}

/**
 * 算今天的额度。
 *
 * @param {object} p
 * @param {number} p.monthlyBudget   本月额度（= 月均支出）
 * @param {number} p.spentThisMonth  本月已花（只算支出）
 * @param {number} p.spentToday      今天已花（只算支出）
 * @param {Date}   [p.today]         今天（默认系统时间；传进来是为了可测）
 * @returns {object} 见下方字段说明；缺关键数据时 `ok:false` + `reason`
 */
export function calcTodayBudget({ monthlyBudget, spentThisMonth, spentToday, today }) {
  const budget = Number(monthlyBudget)
  const spentM = Number(spentThisMonth) || 0
  const spentD = Number(spentToday) || 0
  const now = today instanceof Date ? today : new Date()

  if (!Number.isFinite(budget) || budget <= 0) {
    return {
      ok: false,
      reason: '先把「月均支出」填上 —— 今日额度是拿它摊出来的，没有它算不出来。',
    }
  }

  const total = daysInMonth(now)
  const dayOfMonth = now.getDate()
  // 剩余天数**含今天**：10 月 12 日 → 31 − 12 + 1 = 20 天
  const daysLeft = total - dayOfMonth + 1

  const remaining = budget - spentM          // 本月还剩多少额度（可能为负 = 已超）
  // 当日上限：把剩余额度平摊到剩下的每一天
  //   ⚠️ 取 max(0) —— 负数上限没有意义，超支由 overMonth 单独表达
  const dailyCap = Math.max(0, remaining / daysLeft)
  const todayLeft = dailyCap - spentD

  /* ---- 进度对照：到这个日子为止"理想上"该花多少 ----
     它解释了"为什么今天的额度变小了" —— 因为前面花快了。 */
  const idealByNow = (budget * dayOfMonth) / total
  const aheadBy = spentM - idealByNow
  const isAhead = aheadBy > 0.5 // 半块钱以内不算超前，免得天天报"你超了 0.3 元"

  const overMonth = remaining < 0
  const overToday = !overMonth && spentD > dailyCap

  let verdict = BUDGET_VERDICT.OK
  if (overMonth) verdict = BUDGET_VERDICT.OVER_MONTH
  else if (overToday) verdict = BUDGET_VERDICT.OVER_TODAY

  /* ---- 月底预测：按现在这个花法，这个月会超多少 ---- */
  const avgPerDay = spentM / dayOfMonth
  const projected = avgPerDay * total
  const projectedOver = projected - budget

  const yuan = (n) => '¥' + Math.round(Math.abs(n)).toLocaleString()
  let headline
  if (overMonth) {
    headline = `本月预算已经用超 ${yuan(remaining)} —— 接下来 ${daysLeft} 天建议先别花。`
  } else if (overToday) {
    headline = `今天已经花超了 ${yuan(todayLeft)}（上限 ${yuan(dailyCap)}，已花 ${yuan(spentD)}）。`
  } else {
    headline = `今天还能花 ${yuan(todayLeft)}`
      + `（上限 ${yuan(dailyCap)}，已用 ${yuan(spentD)}）。`
  }

  return {
    ok: true,
    reason: '',
    date: ymd(now),
    daysInMonth: total,
    dayOfMonth,
    daysLeft,
    monthlyBudget: budget,
    spentThisMonth: spentM,
    spentToday: spentD,
    remaining,
    dailyCap,
    todayLeft,
    idealByNow,
    aheadBy,
    isAhead,
    overMonth,
    overToday,
    verdict,
    projected,
    projectedOver,
    headline,
  }
}
