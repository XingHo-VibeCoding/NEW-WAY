import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BindingDecor from '../components/BindingDecor.jsx'
import Icon from '../components/Icon.jsx'
import Toast from '../components/Toast.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { useLocalStorage, KEYS } from '../hooks/useLocalStorage.js'
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  restoreExpense,
  IS_WIRED,
  apiOriginLabel,
} from '../api/client.js'
import './Expense.css'

/**
 * 简册 · 记一笔（账簿面 · Day 16 v1.12 建 · Day 22 接云端 + 改删）
 *
 * 已实现：
 *   - 装订册三件套（朱+装订孔+"账"印章）
 *   - 表单（日期 / 金额 / 类型 / 分类 / 备注 + 保存按钮）
 *   - 月份切换（select）+ 类型筛选（全部 / 收入 / 支出）
 *   - 流水列表（按日期倒序）
 *   - **Day 22**：数据**优先读云端**（连不上回落浏览器本地那份）
 *   - **Day 22**：列表每行「编辑」（PATCH）/「删除」（DELETE，先问一次 + 6 秒可撤销）
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

/** 金额显示：一律两位小数 + 千分位（与新老版本口径一致，也让前后对比看得清） */
function money(n) {
  return '¥' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 新的一笔的编号（仅本地模式用；云端模式下编号由服务端给） */
function makeId() {
  return 'ex_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
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

/** 一份空表单（保存完 / 取消编辑 / 切筛选之后都回到它） */
function emptyDraft() {
  return {
    date: todayISO(),
    amount: '',
    type: '支出',
    category: CATS['支出'][0],
    note: '',
  }
}

export default function Expense() {
  /* ------------------------------------------------------------
     数据来源：两个副本，云端优先（照底牌页 Day 20 的写法）
     ------------------------------------------------------------
       expenses —— 页面显示的那一份
           ↑ 云端拉成功用云端     ↑ 拉不到用浏览器本地那份

     为什么保留本地那份：接口挂了 / 地址没配 / 断网时，页面**不能白屏** ——
     白屏会让人以为「代码写坏了」，其实只是网断了。
     ------------------------------------------------------------ */
  const [localExpenses, setLocalExpenses] = useLocalStorage(KEYS.expenses, SEED_EXPENSES)
  const [expenses, setExpenses] = useState(localExpenses)
  const [source, setSource] = useState(IS_WIRED ? 'loading' : 'local')
  const [loadError, setLoadError] = useState('')

  /* ⚠️ expenses 一变就同步回浏览器抽屉：
     这样下次断网打开时，本地那份也是最新的（不是几个月前的旧账）。
     放在 effect 里而不是每个 handler 里各写一遍 —— 少一处漏写的机会。 */
  useEffect(() => {
    setLocalExpenses(expenses)
  }, [expenses, setLocalExpenses])

  const [filterMonth, setFilterMonth] = useState(() => monthOfYday(todayISO()))
  const [filterType, setFilterType] = useState('all')
  const [draft, setDraft] = useState(emptyDraft)
  const [formError, setFormError] = useState('')

  /* editingId：null = 新增模式；有值 = 正在改那一条的编号 */
  const [editingId, setEditingId] = useState(null)
  /* 正在发请求（保存 / 删除），用来防连点 */
  const [busy, setBusy] = useState(false)
  /* 待确认删除的那一条；null = 没弹窗 */
  const [pendingDelete, setPendingDelete] = useState(null)
  /* 浮动提示 */
  const [toast, setToast] = useState({ message: '', action: null, seq: 0 })

  const formRef = useRef(null)
  const listRef = useRef(null)

  /** 弹一句提示（seq 自增 → 同一句话连续出现也能重新显示并重新计时） */
  const showToast = useCallback((message, action) => {
    setToast((prev) => ({ message, action: action || null, seq: prev.seq + 1 }))
  }, [])

  /* ------------------------------------------------------------
     拉云端数据（照底牌页同一套）
     ------------------------------------------------------------ */
  const syncFromCloud = useCallback(async (markLoading) => {
    if (!IS_WIRED) {
      setSource('local')
      setLoadError('未配置接口地址')
      return
    }
    if (markLoading) setSource('loading')

    try {
      const list = await getExpenses()
      setExpenses(list)
      setSource('cloud')
      setLoadError('')
    } catch (e) {
      /* ⚠️ 失败**不抛**：抛出去整页会崩成白屏，那是更糟的结果。
         只把状态摆出来，页面照常显示本地那份。 */
      setSource('local')
      setLoadError(e && e.message ? e.message : '读取失败')
    }
  }, [])

  /* ⚠️ 关于 lint 的 `set-state-in-effect` 警告（本行会被标红）：
     **这一条是预期的，刻意不修。** 它说的是「effect 里改状态会多渲染一次」。
     但本页的场景恰恰需要它 ——「进页面就去问云端要数据」是本页数据来源的全部，
     不存在能从别的事件派生的写法。而且状态是在 await 之后改的，
     React 早把第一屏画完了，用户看不到中间状态。
     规则针对的是「同步改」那种真的浪费渲染的情况。
     ⚠️ 试过加 `await Promise.resolve()` 提前让出来骗过规则 ——
        那是为工具扭曲代码，不做（底牌页 Home.jsx 同样保留此警告，口径一致）。 */
  useEffect(() => {
    syncFromCloud(false)
  }, [syncFromCloud])

  /** 云端模式：所有增删改都真的发接口；本地模式：只改浏览器 */
  const usingCloud = IS_WIRED && source === 'cloud'

  /* ------------------------------------------------------------
     列表与合计
     ------------------------------------------------------------ */
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

  /* ------------------------------------------------------------
     编辑态
     ------------------------------------------------------------ */

  /**
   * 退出编辑态并把表单清空。
   * ⚠️ 两件事必须一起做（AGENTS.md 附三的「编辑态保护」）：
   *    只把 editingId 置 null、**留着表单里填满的内容**，下次点保存
   *    会莫名其妙新增一条 —— 内容还是刚才那条的。所以这里一起 reset。
   */
  const leaveEditMode = useCallback(() => {
    setEditingId(null)
    setDraft(emptyDraft())
    setFormError('')
  }, [])

  /** 点某行「编辑」：把那条填回上面的表单 */
  const enterEdit = (row) => {
    setEditingId(row.id)
    setDraft({
      date: row.date,
      amount: String(row.amount),
      type: row.type,
      category: row.category,
      note: row.note || '',
    })
    setFormError('')
    showToast('已载入这条记录，改完点「保存修改」')

    // 内容被填到上面的表单里了，把表单滚进视野 —— 不然用户会以为点错了。
    // 系统开了「减少动效」就直接跳过去，不做平滑滚动。
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    formRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
  }

  /* ------------------------------------------------------------
     表单：校验 + 保存（新增 / 修改）
     ------------------------------------------------------------ */

  /** 校验通过返回 { value }，否则返回 { error } */
  const validateDraft = () => {
    const amount = Number(draft.amount)
    if (!draft.date) return { error: '请填日期' }
    if (!Number.isFinite(amount) || amount <= 0) return { error: '金额必须是大于 0 的数字' }
    if (!TYPES.includes(draft.type)) return { error: '类型只能选收入或支出' }
    if (!CATS[draft.type].includes(draft.category)) return { error: '分类与类型不一致' }
    return { value: { date: draft.date, amount, type: draft.type, category: draft.category, note: draft.note.trim() } }
  }

  /**
   * 算出「真正要改的字段」。
   * ⚠️ 只发改过的 —— 后端契约就是这么要求的（PATCH = 局部更新），
   *    而且把没动的字段一起发过去，并发下会**覆盖别人刚做的修改**（丢更新）。
   *    后端虽然也会自己筛一遍，但**前端不该把担子全推给它**：
   *    少发几个字段，网络小一点、出错面也小一点。
   */
  const buildPatch = (original, next) => {
    const patch = {}
    if (next.date !== original.date) patch.date = next.date
    if (Number(next.amount) !== Number(original.amount)) patch.amount = next.amount
    if (next.type !== original.type) patch.type = next.type
    if (next.category !== original.category) patch.category = next.category
    // note 的 null 与 '' 是同一个意思（前端根本区分不出来），归一后再比
    if ((next.note || '') !== (original.note || '')) patch.note = next.note
    return patch
  }

  const onSave = async (e) => {
    e.preventDefault()
    if (busy) return

    const checked = validateDraft()
    if (checked.error) {
      setFormError(checked.error)
      return
    }
    setFormError('')

    /* ============ 修改已有的一条（PATCH） ============ */
    if (editingId !== null) {
      const original = expenses.find((x) => x.id === editingId)
      if (!original) {
        // 正在改的那条没了（别处删了 / 数据被换了）→ 老实退出编辑态
        leaveEditMode()
        showToast('这条记录已经不在列表里了，已退出编辑')
        return
      }

      const patch = buildPatch(original, checked.value)
      if (Object.keys(patch).length === 0) {
        // 一个字段都没变：不白跑一趟接口，也不谎报「改好了」
        leaveEditMode()
        showToast('没有改动，已退出编辑')
        return
      }

      if (!usingCloud) {
        // 本地模式：只改浏览器
        setExpenses((prev) =>
          prev.map((x) =>
            x.id === editingId ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x
          )
        )
        leaveEditMode()
        showToast('已保存修改（本地副本，未同步云端）')
        return
      }

      setBusy(true)
      try {
        const updated = await updateExpense(editingId, patch)
        setExpenses((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
        leaveEditMode()
        showToast('已保存修改')
      } catch (err) {
        // ⚠️ 失败时**保留编辑态**：用户填的内容不能丢，改一下再存一次就行
        setFormError(err && err.message ? err.message : '修改失败，请稍后重试')
      } finally {
        setBusy(false)
      }
      return
    }

    /* ============ 新增（POST） ============ */
    if (!usingCloud) {
      const row = { id: makeId(), ...checked.value, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      setExpenses((prev) => [row, ...prev])
      setDraft({ ...emptyDraft(), type: draft.type, category: CATS[draft.type][0] })
      showToast('已记下这笔（本地副本，未同步云端）')
      return
    }

    setBusy(true)
    try {
      const created = await createExpense(checked.value)
      setExpenses((prev) => [created, ...prev])
      // 保留用户选的类型，省得记第二笔时又要重选
      setDraft({ ...emptyDraft(), type: draft.type, category: CATS[draft.type][0] })
      showToast('已记下这笔')
    } catch (err) {
      setFormError(err && err.message ? err.message : '保存失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  /* ------------------------------------------------------------
     删除：先问一次 → 真删 → 6 秒内可撤销
     ------------------------------------------------------------ */

  const onDeleteClick = (row) => {
    setPendingDelete(row)
  }

  /** 撤销删除：把这一条按原编号写回去 */
  const undoDelete = async (row) => {
    if (!usingCloud) {
      setExpenses((prev) => [row, ...prev])
      showToast('已撤销删除（本地副本）')
      return
    }
    try {
      const restored = await restoreExpense(row)
      setExpenses((prev) => [restored, ...prev.filter((x) => x.id !== restored.id)])
      showToast('已撤销删除')
    } catch (err) {
      /* ⚠️ 撤销失败必须**说清楚后果**，不能只说「失败了」：
         用户以为自己救回来了，其实那条已经没了 —— 这种错最难发现。
         所以这里明说「没有找回来」，让他知道要重新记。 */
      showToast(
        '撤销失败，这一笔没能找回来（' + (err && err.message ? err.message : '未知原因') + '），请重新记一次'
      )
    }
  }

  const confirmDelete = async () => {
    const row = pendingDelete
    setPendingDelete(null)
    if (!row || busy) return

    /* 先做**本地该做的事**（不管云端成不成，界面状态要先一致）：
       正在编辑这条 → 退出编辑态。这样做是有血的教训的：
       只删数据不退出编辑态的话，表单里还留着那条的内容，
       用户下次点「保存修改」会去改一条已经不存在的记录。 */
    if (editingId === row.id) leaveEditMode()

    if (!usingCloud) {
      setExpenses((prev) => prev.filter((x) => x.id !== row.id))
      showToast('已删除（本地副本）', { label: '撤销', onClick: () => undoDelete(row) })
      return
    }

    setBusy(true)
    try {
      await deleteExpense(row.id)
      setExpenses((prev) => prev.filter((x) => x.id !== row.id))
      showToast('已删除这一笔', { label: '撤销', onClick: () => undoDelete(row) })
    } catch (err) {
      /* ⚠️ 删失败时**什么都不能动**：列表里那一条原样留着。
         如果这里也把它从界面上抹掉，用户就以为删成功了 ——
         而库里其实还在，刷新一下又冒出来。**不确定的时候宁可不删。** */
      showToast('删除失败：' + (err && err.message ? err.message : '请稍后重试'))
    } finally {
      setBusy(false)
    }
  }

  /* ------------------------------------------------------------
     筛选切换时的编辑态保护（AGENTS.md 附三硬口径）
     ------------------------------------------------------------ */
  const changeMonth = (m) => {
    if (editingId !== null) {
      leaveEditMode()
      showToast('已退出编辑（月份切换了）')
    }
    setFilterMonth(m)
  }

  const changeFilterType = (t) => {
    if (editingId !== null) {
      leaveEditMode()
      showToast('已退出编辑（筛选切换了）')
    }
    setFilterType(t)
  }

  const monthLabel = filterMonth.replace('-', '年') + '月'
  const editingRow = editingId !== null ? expenses.find((x) => x.id === editingId) : null

  const sourceLabel =
    source === 'cloud' ? '云端数据库' : source === 'loading' ? '正在连云端…' : '浏览器本地副本'

  return (
    <section
      className="expense page page-ledger"
      /* ⚠️ 这两个 data 属性是**给自动化测试看的**（不是给人看的，页面上不显示）：
         没有它们，测试只能靠读中文文案来判断「现在是不是编辑态」「数据来自哪」——
         而文案是最容易改的东西，改一个字测试就全红，那种红是假警报。
         用属性当接口，文案随便改，测试不受影响。 */
      data-source={source}
      data-editing-id={editingRow ? editingRow.id : ''}
    >
      <BindingDecor face="ledger" />
      <div className="page-module">账簿面</div>

      {/* 数据来源说明：让「这份数据是哪来的」看得见，不用开 F12 猜 */}
      <p className="expense-source" role="status">
        数据来源：<strong>{sourceLabel}</strong>
        {loadError === '' ? '' : `（${loadError}）`}
        {source === 'cloud' ? '' : ' · 改动只存在这台设备上'}
        <span className="expense-source-host"> · {apiOriginLabel()}</span>
      </p>

      {/* 表单 */}
      <form className="card expense-form" onSubmit={onSave} ref={formRef}>
        <h2 className="card-title card-title-with-icon">
          <Icon name="abacus" size={22} />
          {editingId !== null ? '改一笔' : '记一笔'}
        </h2>
        <p className="card-sub">
          {editingId !== null
            ? '正在修改这一条，改完点「保存修改」；点「取消编辑」放弃这次修改。'
            : '金额为正数，收入 / 支出靠类型区分，不靠正负号'}
        </p>
        <div className="form-row">
          <label className="form-key" htmlFor="ex-date">日期<span className="req">*</span></label>
          <input
            id="ex-date"
            type="date"
            required
            value={draft.date}
            aria-invalid={formError.includes('日期') ? 'true' : undefined}
            aria-describedby={formError.includes('日期') ? 'expense-form-err' : undefined}
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
                onClick={() => setDraft({ ...draft, type: t, category: CATS[t][0] })}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="form-row">
          <label className="form-key" htmlFor="ex-category">分类<span className="req">*</span></label>
          <select
            id="ex-category"
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
          <label className="form-key" htmlFor="ex-amount">金额<span className="req">*</span></label>
          <input
            id="ex-amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            required
            placeholder="例如 38.50"
            value={draft.amount}
            aria-invalid={formError.includes('金额') ? 'true' : undefined}
            aria-describedby={formError.includes('金额') ? 'expense-form-err' : undefined}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
            aria-label="金额（正数，最多两位小数）"
          />
          <span className="profile-unit">元</span>
        </div>
        <div className="form-row">
          <label className="form-key" htmlFor="ex-note">备注</label>
          <input
            id="ex-note"
            type="text"
            maxLength={50}
            placeholder="选填（50 字内）"
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            aria-label="备注"
          />
        </div>
        {formError && (
          <p className="field-err" id="expense-form-err" role="alert">{formError}</p>
        )}
        <div className="form-actions">
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? '处理中…' : editingId !== null ? '保存修改' : '保存这笔'}
          </button>
          {editingId !== null && (
            <button type="button" className="ghost-btn" onClick={leaveEditMode} disabled={busy}>
              取消编辑
            </button>
          )}
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
              onChange={(e) => changeMonth(e.target.value)}
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
                  onClick={() => changeFilterType(t.v)}
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
              {totals.income > 0 ? money(totals.income) : '—'}
            </div>
          </div>
          <div className="stat" aria-label={`${monthLabel}支出 ${totals.expense} 元`}>
            <div className="stat-label">{monthLabel}支出</div>
            <div className="stat-value">
              {totals.expense > 0 ? money(totals.expense) : '—'}
            </div>
          </div>
          <div className="stat" aria-label={`${monthLabel}结余 ${totals.balance} 元`}>
            <div className="stat-label">{monthLabel}结余</div>
            <div className="stat-value">
              {totals.balance !== 0 ? money(totals.balance) : '—'}
            </div>
          </div>
        </div>

        {/* ⚠️ tabIndex={-1}：删除后焦点要有个去处（弹层关闭时还焦点用） */}
        <div ref={listRef} tabIndex={-1} className="expense-list-body">
          {filtered.length === 0 ? (
            <p className="empty-hint">这个月还没记录</p>
          ) : (
            <ul className="expense-ul">
              {filtered.map((e) => (
                <li
                  key={e.id}
                  className={`expense-row ${e.type === '收入' ? 'is-income' : 'is-expense'}${
                    editingId === e.id ? ' is-editing' : ''
                  }`}
                >
                  <div className="row-main">
                    <span className="row-date">{e.date}</span>
                    <span className="row-cat">{e.category}</span>
                    {e.note && <span className="row-note">{e.note}</span>}
                  </div>
                  <div className="row-amount">
                    {e.type === '支出' ? '-' : '+'}
                    {money(e.amount)}
                  </div>
                  <div className="row-acts">
                    <button
                      type="button"
                      className="row-act"
                      onClick={() => enterEdit(e)}
                      disabled={busy}
                      aria-label={`编辑 ${e.date} ${e.category} ${e.amount} 元`}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="row-act is-del"
                      onClick={() => onDeleteClick(e)}
                      disabled={busy}
                      aria-label={`删除 ${e.date} ${e.category} ${e.amount} 元`}
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 删除确认弹层（危险操作必须先问一次） */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="确认删除？"
        text={
          pendingDelete
            ? `要删掉的是：${pendingDelete.date} · ${pendingDelete.category} · ${money(pendingDelete.amount)}${
                pendingDelete.note ? ` · ${pendingDelete.note}` : ''
              }。删掉之后 6 秒内可以撤销。`
            : ''
        }
        confirmLabel="确认删除"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
        fallbackRef={listRef}
      />

      <Toast key={toast.seq} message={toast.message} action={toast.action} />
    </section>
  )
}
