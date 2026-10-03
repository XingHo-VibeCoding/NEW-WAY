import { useMemo, useState } from 'react'
import BindingDecor from '../components/BindingDecor.jsx'
import Icon from '../components/Icon.jsx'
import { useLocalStorage, KEYS } from '../hooks/useLocalStorage.js'
import './Expense.css'

/**
 * 简册 · 记一笔（账簿面 · Day 16 v1.12 · 1:1 简化复刻）
 *
 * 已实现：
 *   - 装订册三件套（朱+装订孔+"账"印章）
 *   - 表单（日期 / 金额 / 类型 / 分类 / 备注 + 保存按钮）
 *   - 月份切换（select）+ 类型筛选（全部 / 收入 / 支出）
 *   - 流水列表（按日期倒序，按 `ex_seed_*` 等已有假数据呈现）
 *   - 删除按钮（直接删，无 6s 撤销）
 *
 * 仍推 Day 17-18：编辑、6s 删除撤销、月度合计双栏展示、复制内容到工作流
 *
 * 🔴 个人信息红线：本页不读 / 不发 profile.contact（AGENTS.md 附三第 5 条）
 */

const TYPES = ['收入', '支出']
const CATS = {
  收入: ['工资', '兼职', '理财收益', '其他'],
  支出: ['餐饮', '交通', '房租', '购物', '医疗', '娱乐', '其他'],
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthOfYday(d) {
  return d ? d.slice(0, 7) : ''
}

function makeId() {
  return 'ex_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
}

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
  {
    id: 'ex_seed_4',
    date: '2026-08-15',
    amount: 8000,
    type: '收入',
    category: '工资',
    note: '',
    createdAt: '2026-08-15T09:10:00.000Z',
    updatedAt: '2026-08-15T09:10:00.000Z',
  },
  {
    id: 'ex_seed_5',
    date: '2026-08-18',
    amount: 56,
    type: '支出',
    category: '餐饮',
    note: '午饭',
    createdAt: '2026-08-18T12:00:00.000Z',
    updatedAt: '2026-08-18T12:00:00.000Z',
  },
]

export default function Expense() {
  const [expenses, setExpenses] = useLocalStorage(KEYS.expenses, SEED_EXPENSES)

  const [filterMonth, setFilterMonth] = useState(() => monthOfYday(todayISO()))
  const [filterType, setFilterType] = useState('all')
  const [draft, setDraft] = useState({
    date: todayISO(),
    amount: '',
    type: '支出',
    category: CATS['支出'][0],
    note: '',
  })
  const [formError, setFormError] = useState('')

  const allMonths = useMemo(() => {
    const set = new Set(expenses.map((e) => monthOfYday(e.date)).filter(Boolean))
    set.add(monthOfYday(todayISO()))
    return [...set].sort().reverse()
  }, [expenses])

  const filtered = useMemo(() => {
    return expenses
      .filter((e) => monthOfYday(e.date) === filterMonth)
      .filter((e) => filterType === 'all' || e.type === filterType)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1
        return (a.createdAt || '') < (b.createdAt || '') ? 1 : -1
      })
  }, [expenses, filterMonth, filterType])

  const totals = useMemo(() => {
    const income = filtered.filter((e) => e.type === '收入').reduce((a, b) => a + Number(b.amount || 0), 0)
    const expense = filtered.filter((e) => e.type === '支出').reduce((a, b) => a + Number(b.amount || 0), 0)
    return { income, expense, balance: income - expense }
  }, [filtered])

  const onTypeChange = (newType) => {
    setDraft({
      ...draft,
      type: newType,
      category: CATS[newType][0],
    })
  }

  const onSave = (e) => {
    e.preventDefault()
    const amount = Number(draft.amount)
    if (!draft.date) return setFormError('请填日期')
    if (!Number.isFinite(amount) || amount <= 0) return setFormError('金额必须是大于 0 的数字')
    if (!TYPES.includes(draft.type)) return setFormError('类型必须选 / 收或支')
    if (!CATS[draft.type].includes(draft.category)) return setFormError('分类与类型不一致')
    const newRow = {
      id: makeId(),
        date: draft.date,
        amount,
        type: draft.type,
        category: draft.category,
        note: draft.note.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    setExpenses([newRow, ...expenses])
    setDraft({ date: todayISO(), amount: '', type: draft.type, category: CATS[draft.type][0], note: '' })
    setFormError('')
  }

  const onDelete = (id) => {
    setExpenses(expenses.filter((e) => e.id !== id))
  }

  const monthLabel = filterMonth.replace('-', '年') + '月'

  return (
    <section className="expense page page-ledger">
      <BindingDecor face="ledger" />
      <div className="page-module">账簿面</div>

      {/* 表单 */}
      <form className="card expense-form" onSubmit={onSave}>
        <h2 className="card-title card-title-with-icon">
          <Icon name="abacus" size={22} />
          记一笔
        </h2>
        <p className="card-sub">金额为正数，收入 / 支出靠类型区分，不靠正负号</p>
        <div className="form-row">
          <label className="form-key">日期<span className="req">*</span></label>
          <input
            type="date"
            required
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </div>
        <div className="form-row">
          <label className="form-key">类型<span className="req">*</span></label>
          <div className="seg" role="radiogroup" aria-label="类型">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={draft.type === t}
                className={draft.type === t ? 'is-on' : ''}
                onClick={() => onTypeChange(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="form-row">
          <label className="form-key">分类<span className="req">*</span></label>
          <select
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            aria-label="分类"
          >
            {CATS[draft.type].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label className="form-key">金额<span className="req">*</span></label>
          <input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            required
            placeholder="例如 38.50"
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
            aria-label="金额（正数，最多两位小数）"
          />
          <span className="profile-unit">元</span>
        </div>
        <div className="form-row">
          <label className="form-key">备注</label>
          <input
            type="text"
            placeholder="选填"
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            aria-label="备注"
          />
        </div>
        {formError && <p className="field-err" role="alert">{formError}</p>}
        <div className="form-actions">
          <button type="submit" className="primary-btn">保存这笔</button>
        </div>
      </form>

      {/* 列表 */}
      <div className="card expense-list">
        <h2 className="card-title card-title-with-icon">
          <Icon name="list" size={22} />
          流水
        </h2>
        <div className="list-toolbar">
          <label className="toolbar-row">
            <span className="toolbar-key">月份</span>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              aria-label="月份筛选"
            >
              {allMonths.map((m) => (
                <option key={m} value={m}>{m.replace('-', '年') + '月'}</option>
              ))}
            </select>
          </label>
          <label className="toolbar-row">
            <span className="toolbar-key">类型</span>
            <div className="seg" role="radiogroup" aria-label="类型筛选">
              {[
                { v: 'all', label: '全部' },
                { v: '收入', label: '收入' },
                { v: '支出', label: '支出' },
              ].map((t) => (
                <button
                  key={t.v}
                  type="button"
                  role="radio"
                  aria-checked={filterType === t.v}
                  className={filterType === t.v ? 'is-on' : ''}
                  onClick={() => setFilterType(t.v)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </label>
        </div>

        <div className="stats is-three">
          <div className="stat" aria-label={`${monthLabel}收入 ${totals.income} 元`}>
            <div className="stat-label">{monthLabel}收入</div>
            <div className="stat-value">
              {totals.income > 0 ? `¥${totals.income.toLocaleString()}` : '—'}
            </div>
          </div>
          <div className="stat" aria-label={`${monthLabel}支出 ${totals.expense} 元`}>
            <div className="stat-label">{monthLabel}支出</div>
            <div className="stat-value">
              {totals.expense > 0 ? `¥${totals.expense.toLocaleString()}` : '—'}
            </div>
          </div>
          <div className="stat" aria-label={`${monthLabel}结余 ${totals.balance} 元`}>
            <div className="stat-label">{monthLabel}结余</div>
            <div className="stat-value">
              {totals.balance !== 0 ? `¥${totals.balance.toLocaleString()}` : '—'}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="empty-hint">这个月还没记录，靠左有它</p>
        ) : (
          <ul className="expense-ul">
            {filtered.map((e) => (
              <li key={e.id} className={`expense-row ${e.type === '收入' ? 'is-income' : 'is-expense'}`}>
                <div className="row-main">
                  <span className="row-date">{e.date}</span>
                  <span className="row-cat">{e.category}</span>
                  {e.note && <span className="row-note">{e.note}</span>}
                </div>
                <div className="row-amount">
                  {e.type === '支出' ? '-' : '+'}¥{Number(e.amount).toLocaleString()}
                </div>
                <button
                  type="button"
                  className="row-del"
                  onClick={() => onDelete(e.id)}
                  aria-label={`删除 ${e.date} ${e.category} ${e.amount} 元`}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}