import { useMemo, useState } from 'react'
import BindingDecor from '../components/BindingDecor.jsx'
import Icon from '../components/Icon.jsx'
import { useLocalStorage, KEYS } from '../hooks/useLocalStorage.js'
import './Entry.css'

/**
 * 简册 · 记一条（简历面 · Day 16 v1.12 · 1:1 简化复刻）
 *
 * 已实现：
 *   - 装订册三件套（灰细线+点阵+"履"印章）
 *   - 表单（开始日期 / 结束日期 / 公司 / 职位 / 内容 / 成果）
 *   - 经历列表（按 endDate 倒序 · endDate 为空 = 还在做排最前）
 *   - 删除按钮
 *
 * 仍推 Day 18：编辑、排序规则选项（最近 / 大都 / 还在做）、AI 优化单条（Day 14 已实现）
 *
 * 字段（按 PRD 5.2 / TECH_DESIGN 5.2）：
 *   startDate, endDate（"" = 还做）, content（成果前缀在显示处加）, org, role, result
 *   ⚠️ 不含 tags（Day 7 拍板砍掉）
 */

const SEED_ENTRIES = [
  {
    id: 'en_seed_1',
    startDate: '2025-03-01',
    endDate: '',
    content: '把首页加载从 5 秒压到 2 秒',
    org: '某某科技',
    role: '前端工程师',
    result: '响应快 3 秒',
    createdAt: '2025-03-01T00:00:00.000Z',
    updatedAt: '2025-03-01T00:00:00.000Z',
  },
  {
    id: 'en_seed_2',
    startDate: '2023-06-01',
    endDate: '2024-12-15',
    content: '主导后台重构，从 jQuery 迁到 Vue3',
    org: '某网络公司',
    role: '前端工程师',
    result: '首屏 1.2 秒，团队效率 +30%',
    createdAt: '2023-06-01T00:00:00.000Z',
    updatedAt: '2024-12-15T00:00:00.000Z',
  },
  {
    id: 'en_seed_3',
    startDate: '2021-07-01',
    endDate: '2023-05-30',
    content: '负责官网与小程序日常迭代',
    org: '某电商公司',
    role: 'Web 开发',
    result: '年活动峰值 80 万 UV',
    createdAt: '2021-07-01T00:00:00.000Z',
    updatedAt: '2023-05-30T00:00:00.000Z',
  },
]

function makeId() {
  return 'en_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
}

export default function Entry() {
  const [entries, setEntries] = useLocalStorage(KEYS.entries, SEED_ENTRIES)
  const [draft, setDraft] = useState({
    startDate: '',
    endDate: '',
    content: '',
    org: '',
    role: '',
    result: '',
  })
  const [formError, setFormError] = useState('')

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      // endDate 为空 = 还在做 → 排最前
      if (!a.endDate && b.endDate) return -1
      if (a.endDate && !b.endDate) return 1
      if (a.endDate !== b.endDate) return a.endDate < b.endDate ? 1 : -1
      // endDate 相同按 startDate 倒序
      return a.startDate < b.startDate ? 1 : -1
    })
  }, [entries])

  const onSave = (e) => {
    e.preventDefault()
    if (!draft.content.trim()) return setFormError('内容不能为空')
    if (!draft.startDate) return setFormError('请填开始日期')
    if (draft.endDate && draft.endDate < draft.startDate)
      return setFormError('结束日期不能早于开始日期')
    const newRow = {
      id: makeId(),
      startDate: draft.startDate,
      endDate: draft.endDate || '',
      content: draft.content.trim(),
      org: draft.org.trim(),
      role: draft.role.trim(),
      result: draft.result.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setEntries([newRow, ...entries])
    setDraft({ startDate: '', endDate: '', content: '', org: '', role: '', result: '' })
    setFormError('')
  }

  const onDelete = (id) => {
    setEntries(entries.filter((e) => e.id !== id))
  }

  return (
    <section className="entry page page-resume">
      <BindingDecor face="resume" />
      <div className="page-module">简历面</div>

      {/* 表单 */}
      <form className="card entry-form" onSubmit={onSave}>
        <h2 className="card-title card-title-with-icon">
          <Icon name="file" size={22} />
          记一条
        </h2>
        <p className="card-sub">
          一条做成的就是一段 + 一份成果（量化更好）。结束日期留空 = 还在做。
        </p>

        <div className="form-row">
          <label className="form-key">开始<span className="req">*</span></label>
          <input
            type="date"
            required
            value={draft.startDate}
            onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
            aria-label="开始日期"
          />
        </div>
        <div className="form-row">
          <label className="form-key">结束</label>
          <input
            type="date"
            value={draft.endDate}
            onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
            aria-label="结束日期（留空=还在做）"
          />
        </div>
        <div className="form-row">
          <label className="form-key">公司</label>
          <input
            type="text"
            placeholder="选填"
            value={draft.org}
            onChange={(e) => setDraft({ ...draft, org: e.target.value })}
            aria-label="公司"
          />
        </div>
        <div className="form-row">
          <label className="form-key">职位</label>
          <input
            type="text"
            placeholder="选填"
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            aria-label="职位"
          />
        </div>
        <div className="form-row">
          <label className="form-key">内容<span className="req">*</span></label>
          <input
            type="text"
            required
            placeholder="做了什么（动词开头）"
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
          />
        </div>
        <div className="form-row">
          <label className="form-key">成果</label>
          <input
            type="text"
            placeholder="量化更好（选填）"
            value={draft.result}
            onChange={(e) => setDraft({ ...draft, result: e.target.value })}
          />
        </div>
        {formError && <p className="field-err" role="alert">{formError}</p>}
        <div className="form-actions">
          <button type="submit" className="primary-btn">保存这条</button>
        </div>
      </form>

      {/* 列表 */}
      <div className="card entry-list">
        <h2 className="card-title card-title-with-icon">
          <Icon name="list" size={22} />
          经历（按"结束日期"晚 → 早，空 = 还在做排最前）
        </h2>
        {sorted.length === 0 ? (
          <p className="empty-hint">还没经历，靠左表单加一条</p>
        ) : (
          <ul className="entry-ul">
            {sorted.map((e) => (
              <li key={e.id} className={`entry-row ${!e.endDate ? 'is-current' : ''}`}>
                <div className="entry-period">
                  <span className="entry-date">{e.startDate}</span>
                  <span className="entry-tilde">—</span>
                  <span className="entry-date">{e.endDate || '进行中'}</span>
                </div>
                <div className="entry-main">
                  {(e.org || e.role) && (
                    <div className="entry-meta">
                      {e.role && <span className="entry-role">{e.role}</span>}
                      {e.role && e.org && <span className="entry-sep"> · </span>}
                      {e.org && <span className="entry-org">{e.org}</span>}
                    </div>
                  )}
                  <div className="entry-content">{e.content}</div>
                  {e.result && (
                    <div className="entry-result">成果：{e.result}</div>
                  )}
                </div>
                <button
                  type="button"
                  className="row-del"
                  onClick={() => onDelete(e.id)}
                  aria-label={`删除 ${e.startDate} 起 ${e.org || '经历'}`}
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