import { useMemo } from 'react'
import BindingDecor from '../components/BindingDecor.jsx'
import { useLocalStorage, KEYS } from '../hooks/useLocalStorage.js'
import './Home.css'

/**
 * 简册 · 底牌页（账簿面 · Day 16 v1.12 · 1:1 简化复刻）
 *
 * 已实现：
 *   - 装订册三件套（朱+装订孔+"账"印章）
 *   - 大数字（能撑几个月 = savings ÷ monthlyExpense）
 *   - 三数（本月收入 / 支出 / 结余 · 当前自然月）
 *   - 个人参数表单（5 个字段：savings / monthlyExpense / name / contact / targetRole）
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
  const [expenses] = useLocalStorage(KEYS.expenses, SEED_EXPENSES)
  const [profile, setProfile] = useLocalStorage(KEYS.profile, SEED_PROFILE)

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

  return (
    <section className="home page page-ledger">
      <BindingDecor face="ledger" />
      <div className="page-module">账簿面</div>

      <div className="card power">
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
        <h2 className="card-title">本月</h2>
        <p className="card-sub">本月 = 电脑系统时间所在的自然月</p>
        <div className="stats">
          <div className="stat" aria-label={`本月收入 ${income} 元`}>
            <div className="stat-label">本月收入</div>
            <div className={`stat-value ${income === 0 ? 'is-empty' : ''}`}>
              {income > 0 ? `¥${income.toLocaleString()}` : '待记录'}
            </div>
          </div>
          <div className="stat" aria-label={`本月支出 ${expense} 元`}>
            <div className="stat-label">本月支出</div>
            <div className={`stat-value ${expense === 0 ? 'is-empty' : ''}`}>
              {expense > 0 ? `¥${expense.toLocaleString()}` : '待记录'}
            </div>
          </div>
          <div className="stat" aria-label={`本月结余 ${balance} 元`}>
            <div className="stat-label">本月结余</div>
            <div className={`stat-value ${balance === 0 ? 'is-empty' : ''}`}>
              {balance !== 0 ? `¥${balance.toLocaleString()}` : '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">个人参数</h2>
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