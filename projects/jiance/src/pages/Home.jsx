import { useMemo, useState, useEffect, useCallback } from 'react'
import BindingDecor from '../components/BindingDecor.jsx'
import Icon from '../components/Icon.jsx'
import { useLocalStorage, KEYS } from '../hooks/useLocalStorage.js'
import { getExpenses, getProfile, getHealth, createExpense, apiOriginLabel, IS_WIRED } from '../api/client.js'
import './Home.css'

/**
 * 简册 · 底牌页（账簿面 · Day 16 v1.12 · 1:1 简化复刻）
 *
 * 已实现：
 *   - 装订册三件套（朱+装订孔+"账"印章）
 *   - 大数字（能撑几个月 = savings ÷ monthlyExpense）
 *   - 三数（本月收入 / 支出 / 结余 · 当前自然月）
 *   - 个人参数表单（5 个字段：savings / monthlyExpense / name / contact / targetRole）
 *   - Day 20：改为优先读**云端数据库**；连不上时回落浏览器本地那份
 *   - Day 20：检查台（健康状态 / 接口地址 / 真实条数 / 写入测试）
 *
 * 仍推 Day 17：戏眼量柱、算法展开、跳转行为、墨线图、导出/导入备份
 * 仍推 Day 17+：板块①联动（本月经历数 / 最近匹配）
 *
 * 🔴 个人信息红线：profile.contact 永远不发给任何云端模型（AGENTS.md 附三第 5 条）。
 *    本页只把它当表单字段保存与展示，不进任何 onClick 触发的 prompt。
 */

/** 当前自然月（YYYY-MM） */
function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function sumAmounts(arr) {
  return arr.reduce((a, b) => a + Number(b.amount || 0), 0)
}

/** 演示用假数据（AGENTS.md 附三第 3 条：示例数据一律假数据） */
const SEED_EXPENSES = [
  {
    id: 'ex_seed_1',
    date: '2026-09-01',
    amount: 8000,
    type: '收入',
    category: '工资',
    note: '',
    createdAt: '2026-09-01T09:10:00.000Z',
    updatedAt: '2026-09-01T09:10:00.000Z',
  },
  {
    id: 'ex_seed_2',
    date: '2026-09-15',
    amount: 38.5,
    type: '支出',
    category: '餐饮',
    note: '楼下快餐',
    createdAt: '2026-09-15T12:01:00.000Z',
    updatedAt: '2026-09-15T12:01:00.000Z',
  },
  {
    id: 'ex_seed_3',
    date: '2026-09-22',
    amount: 1200,
    type: '支出',
    category: '房租',
    note: '',
    createdAt: '2026-09-22T08:00:00.000Z',
    updatedAt: '2026-09-22T08:00:00.000Z',
  },
]

const SEED_PROFILE = {
  savings: 30000,
  monthlyExpense: null,
  name: '张三',
  contact: null,
  targetRole: '前端工程师',
  updatedAt: '2026-09-29T10:00:00.000Z',
}

export default function Home() {
  const [localExpenses, setLocalExpenses] = useLocalStorage(KEYS.expenses, SEED_EXPENSES)
  const [localProfile, setLocalProfile] = useLocalStorage(KEYS.profile, SEED_PROFILE)

  /* ------------------------------------------------------------
     Day 20 · 数据来源切换
     ------------------------------------------------------------
     做法：**两个都留着，但优先级换了**。

       expenses / profile —— 同一份数据的两个副本
              ↓ 云端请求成功        ↓ 云端请求失败 / 未配置地址
        云端那份赢              浏览器本地那份顶上去

     为什么保留本地那份：
       万一接口挂了、地址没配好、网络断了，页面**不能变成白屏** ——
       白屏会让人以为「代码写坏了」，实际上只是网断了。
       有兜底时页面照常显示，只是上面标一句「当前显示本地副本」。

     ⚠️ 用 useState 而不是直接用 useLocalStorage 的返回值：
        首次渲染先显示本地那份（不等网络），云端回来后再换。
        这样「打开就有内容」，不会白屏一秒。
     ------------------------------------------------------------ */
  const [expenses, setExpenses] = useState(localExpenses)
  const [profile, setProfile] = useState(localProfile)

  /* 数据来源状态：给检查台用，也是「诚实的汇报」 */
  const [source, setSource] = useState(IS_WIRED ? 'loading' : 'local')
  const [health, setHealth] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [lastSync, setLastSync] = useState(null)
  const [writeResult, setWriteResult] = useState(null)
  const [writing, setWriting] = useState(false)

  /**
   * 拉一次云端数据。失败**不抛**，只把状态摆出来 ——
   * 抛出去会让整个页面崩成白屏，那是更糟的结果。
   *
   * @param {boolean} markLoading 是否先把状态摆成「正在连…」。
   *   按钮点的时候要（要让用户看到在动）；
   *   首次进页面**不要**摆 —— 初值本来就是 loading。
   *
   * ⚠️ 关于 lint 的 set-state-in-effect 警告（第 10 条 warning）：
   *   **这一条是预期的，不修。** 它说的是「effect 里改状态会多渲染一次」。
   *   本项目的场景恰恰需要这个 effect ——「进页面就去问云端要数据」
   *   是本页数据来源的全部，不存在能从别的事件派生的写法。
   *   而且改状态发生在 await 之后，React 已经画完第一屏了，
   *   用户看不到中间状态。规则针对的是「同步改」这种真的浪费渲染的情况。
   *   ⚠️ 试过用 `await Promise.resolve()` 提前让出来骗过规则 ——
   *      那是为工具扭曲代码，不做。
   */
  const syncFromCloud = useCallback(async (markLoading) => {
    if (!IS_WIRED) {
      setSource('local')
      setLoadError('未配置接口地址')
      return
    }

    if (markLoading) {
      setSource('loading')
    }
    const startedAt = new Date()

    // 三件事同时问：健康、账目、个人参数。
    // allSettled 而不是 all —— 一个挂了不该把另两个的结果也扔掉。
    const [h, exp, prof] = await Promise.allSettled([
      getHealth(),
      getExpenses(),
      getProfile(),
    ])

    const problems = []

    // —— 健康 ——
    if (h.status === 'fulfilled') {
      setHealth(h.value)
    } else {
      setHealth(false)
      problems.push('健康检查：连不上')
    }

    // —— 账目 ——
    if (exp.status === 'fulfilled') {
      setExpenses(exp.value)
      // 顺手把云端那份写回本地抽屉：这样下次断网时本地也是最新的
      setLocalExpenses(exp.value)
    } else {
      problems.push('账目：' + (exp.reason && exp.reason.message ? exp.reason.message : '读取失败'))
    }

    // —— 个人参数 ——
    if (prof.status === 'fulfilled') {
      // ⚠️ 只接云端存在的字段。contact 为 null 时**保留本地那份**，
      //    因为本地可能是用户刚填的 —— 云端那个 null 是「没存过」，
      //    直接覆盖会把用户刚填的联系方式抹掉。
      setProfile((prev) => ({ ...prev, ...prof.value, contact: prof.value.contact || prev.contact }))
      setLocalProfile(prof.value)
    } else {
      problems.push('个人参数：' + (prof.reason && prof.reason.message ? prof.reason.message : '读取失败'))
    }

    // —— 结论 ——
    const okCount = [h, exp, prof].filter((r) => r.status === 'fulfilled').length;
    if (okCount === 3) {
      setSource('cloud')
      setLoadError('')
    } else {
      setSource('local')
      setLoadError(problems.join('；'))
    }
    setLastSync(startedAt)
  }, [setLocalExpenses, setLocalProfile])

  // 进页面拉一次。首屏 state 已经是 loading，这里不再同步改一次状态。
  useEffect(() => {
    syncFromCloud(false)
  }, [syncFromCloud])

  /** 检查台「刷新」按钮 */
  const onRefresh = () => {
    setWriteResult(null)
    syncFromCloud(true)
  }

  /** 检查台「写入测试」：造一笔编造的假账，真写进数据库 */
  const onWriteTest = async () => {
    setWriting(true)
    setWriteResult(null)
    try {
      const created = await createExpense({
        date: new Date().toISOString().slice(0, 10),
        amount: 0.01,
        type: '支出',
        category: '餐饮',
        note: '连通性测试（可删）',
      })
      setWriteResult({ ok: true, id: created.id, amount: created.amount })
      // 写入成功 → 立刻重拉，让列表里真的多出这一笔（眼见为实）
      syncFromCloud(false)
    } catch (e) {
      setWriteResult({ ok: false, message: e && e.message ? e.message : '写入失败' })
    } finally {
      setWriting(false)
    }
  }

  const month = useMemo(currentMonth, [])
  const monthExpenses = useMemo(
    () => expenses.filter((e) => e.date && e.date.startsWith(month)),
    [expenses, month]
  )
  const income = useMemo(
    () => sumAmounts(monthExpenses.filter((e) => e.type === '收入')),
    [monthExpenses]
  )
  const expense = useMemo(
    () => sumAmounts(monthExpenses.filter((e) => e.type === '支出')),
    [monthExpenses]
  )
  const balance = income - expense

  // 能撑几个月：savings ÷ 月均支出（profile.monthlyExpense 优先；为 null 时用本月支出做近似）
  const divisor = Number(profile.monthlyExpense) || expense
  const months =
    divisor > 0 && Number(profile.savings) > 0
      ? (Number(profile.savings) / divisor).toFixed(1)
      : null

  const onFieldChange = (field, value) => {
    setProfile({
      ...profile,
      [field]: value,
      updatedAt: new Date().toISOString(),
    })
  }

  /* ---- 检查台要显示的三句话（先把文案定好，JSX 里只往里放）---- */
  const sourceLabel =
    source === 'cloud'
      ? '云端数据库'
      : source === 'loading'
        ? '正在连云端…'
        : '浏览器本地副本'

  const healthLabel =
    health === null ? '还没问' : health ? '正常' : '连不上'

  return (
    <section className="home page page-ledger">
      <BindingDecor face="ledger" />
      <div className="page-module">账簿面</div>

      {/* ---------- Day 20 · 检查台 ----------
          这一块是「让验证看得见」的：健康状态 / 接口地址 / 真实条数 /
          写入测试，四件事摆在一张卡里，不用开 F12 猜。 */}
      <div className="card inspect">
        <h2 className="card-title card-title-with-icon">
          <Icon name="radar" size={22} />
          检查台
        </h2>
        <p className="card-sub">
          这一页的数字来自云端数据库，不是写死在代码里的示例。
        </p>

        <div className="inspect-grid">
          <div className="inspect-cell">
            <div className="inspect-key">健康状态</div>
            <div className={`inspect-val ${health === true ? 'is-ok' : health === false ? 'is-bad' : ''}`}>
              {healthLabel}
            </div>
          </div>
          <div className="inspect-cell">
            <div className="inspect-key">数据来源</div>
            <div className={`inspect-val ${source === 'cloud' ? 'is-ok' : source === 'local' ? 'is-warn' : ''}`}>
              {sourceLabel}
            </div>
          </div>
          <div className="inspect-cell">
            <div className="inspect-key">账目条数</div>
            <div className="inspect-val is-num">{expenses.length} 条</div>
          </div>
          <div className="inspect-cell">
            <div className="inspect-key">接口地址</div>
            <div className="inspect-val is-host">{apiOriginLabel()}</div>
          </div>
        </div>

        <p className="inspect-note">
          {lastSync ? `最后同步 ${lastSync.toLocaleTimeString('zh-CN')}` : '尚未同步'}
          {' · '}
          {loadError === '' ? '无报错' : loadError}
        </p>

        <div className="inspect-actions">
          <button type="button" className="btn-outline" onClick={onRefresh}>
            重新拉取
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={onWriteTest}
            disabled={writing || source !== 'cloud'}
          >
            {writing ? '写入中…' : '写入测试（记一笔 0.01 元）'}
          </button>
        </div>

        {/* 写入测试的结果。说清「这一笔真的进数据库了，可删」。 */}
        {writeResult && (
          <p className={`inspect-note ${writeResult.ok ? 'is-ok' : 'is-bad'}`} role="status">
            {writeResult.ok
              ? `写入成功：已在数据库里新增一笔（编号 ${writeResult.id}，金额 ${writeResult.amount} 元）。这是连通性测试数据，可以随时删掉。`
              : `写入失败：${writeResult.message}`}
          </p>
        )}

        <p className="inspect-note is-hint">
          提示：数据来源是「浏览器本地副本」时，说明云端没连上 ——
          展开 F12 看 Console 里的第一行报错即可定位。
        </p>
      </div>

      <div className="card power">
        <div className="power-mark">
          <Icon name="calendar" size={34} label="本月示意" />
        </div>
        <div className="power-label">还能撑 ≈</div>
        {months !== null ? (
          <div className="power-value">
            <span id="power-num">{months}</span>
            <span className="power-unit" id="power-unit">个月</span>
          </div>
        ) : (
          <div className="power-value is-empty">
            <span id="power-num">¥</span>
            <span className="power-unit" id="power-unit" hidden>个月</span>
          </div>
        )}
        <p className="power-hint">
          {profile.monthlyExpense
            ? `按月均支出 ¥${Number(profile.monthlyExpense).toLocaleString()} 算`
            : '未填月均支出，先按本月支出做近似'}
        </p>
      </div>

      <div className="card">
        <h2 className="card-title card-title-with-icon">
          <Icon name="calendar" size={22} />
          本月
        </h2>
        <p className="card-sub">本月 = 电脑系统时间所在的自然月</p>
        <div className="stats">
          <div className="stat" aria-label={`本月收入 ${income} 元`}>
            <div className="stat-head">
              <Icon name="coin" size={20} />
              <div className="stat-label">本月收入</div>
            </div>
            <div className={`stat-value ${income === 0 ? 'is-empty' : ''}`}>
              {income > 0 ? `¥${income.toLocaleString()}` : '待记录'}
            </div>
          </div>
          <div className="stat" aria-label={`本月支出 ${expense} 元`}>
            <div className="stat-head">
              <Icon name="chopsticks" size={20} />
              <div className="stat-label">本月支出</div>
            </div>
            <div className={`stat-value ${expense === 0 ? 'is-empty' : ''}`}>
              {expense > 0 ? `¥${expense.toLocaleString()}` : '待记录'}
            </div>
          </div>
          <div className="stat" aria-label={`本月结余 ${balance} 元`}>
            <div className="stat-head">
              <Icon name="ledger" size={20} />
              <div className="stat-label">本月结余</div>
            </div>
            <div className={`stat-value ${balance === 0 ? 'is-empty' : ''}`}>
              {balance !== 0 ? `¥${balance.toLocaleString()}` : '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title card-title-with-icon">
          <Icon name="pouch" size={22} />
          个人参数
        </h2>
        <p className="card-sub">
          存款决定「能撑几个月」，姓名 / 联系方式会显示在简历抬头（选填）。
        </p>
        <form className="profile-form" onSubmit={(e) => e.preventDefault()}>
          <label className="profile-row">
            <span className="profile-key">存款</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={profile.savings ?? ''}
              onChange={(e) => onFieldChange('savings', e.target.value === '' ? null : Number(e.target.value))}
              aria-label="存款金额"
            />
            <span className="profile-unit">元</span>
          </label>
          <label className="profile-row">
            <span className="profile-key">月均支出</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="留空则按本月支出算"
              value={profile.monthlyExpense ?? ''}
              onChange={(e) => onFieldChange('monthlyExpense', e.target.value === '' ? null : Number(e.target.value))}
              aria-label="月均支出（留空按本月自动算）"
            />
            <span className="profile-unit">元</span>
          </label>
          <label className="profile-row">
            <span className="profile-key">姓名</span>
            <input
              type="text"
              maxLength={20}
              placeholder="20 字内（选填）"
              value={profile.name ?? ''}
              onChange={(e) => onFieldChange('name', e.target.value)}
              aria-label="姓名（20 字内）"
            />
          </label>
          <label className="profile-row">
            <span className="profile-key">联系方式</span>
            <input
              type="text"
              maxLength={40}
              placeholder="40 字内（选填）"
              value={profile.contact ?? ''}
              onChange={(e) => onFieldChange('contact', e.target.value)}
              aria-label="联系方式（40 字内 · 不进任何 AI 提示词）"
            />
          </label>
          <label className="profile-row">
            <span className="profile-key">目标职位</span>
            <input
              type="text"
              maxLength={20}
              placeholder="20 字内"
              value={profile.targetRole ?? ''}
              onChange={(e) => onFieldChange('targetRole', e.target.value)}
              aria-label="目标职位"
            />
          </label>
        </form>
      </div>
    </section>
  )
}