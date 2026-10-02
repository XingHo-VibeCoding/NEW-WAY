import { useMemo } from 'react'
import BindingDecor from '../components/BindingDecor.jsx'
import { useLocalStorage, KEYS } from '../hooks/useLocalStorage.js'
import './Resume.css'

/**
 * 简册 · 简历预览（简历面 · Day 16 v1.12 · 1:1 简化复刻）
 *
 * 已实现：
 *   - 装订册三件套（灰细线+点阵+"履"印章）
 *   - 简历纸（880px 居中 + 深色背景 mock "真玻璃"）
 *   - 抬头（姓名 / 联系方式 / 目标职位）
 *   - 经历按 Entry 排序规则（endDate 倒序 + 空 = 排最前 + startDate 倒序）
 *   - @media print 撕所有装饰（PRD 验收硬指标）
 *
 * 仍推 Day 19：
 *   - 真玻璃效果（@supports backdrop-filter + blur(14px) + 半透明深色）
 *   - AI 简历助手（Day 14 已实现，迁移到 React）
 *   - 装订册以外的红印章「履」/ 描边 / 88px 撑满等
 *
 * 🔴 个人信息红线：
 *   profile.contact 仅在本页**渲染**用，**绝不**进任何 AI 提示词（AGENTS.md 附三第 5 条）。
 */

const SEED_PROFILE = {
  savings: 30000,
  monthlyExpense: null,
  name: '张三',
  contact: null,
  targetRole: '前端工程师',
  updatedAt: '2026-09-29T10:00:00.000Z',
}

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

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    // endDate 空 = 进行中 → 排最前
    if (!a.endDate && b.endDate) return -1
    if (a.endDate && !b.endDate) return 1
    if (a.endDate !== b.endDate) return a.endDate < b.endDate ? 1 : -1
    return a.startDate < b.startDate ? 1 : -1
  })
}

export default function Resume() {
  const [entries] = useLocalStorage(KEYS.entries, SEED_ENTRIES)
  const [profile] = useLocalStorage(KEYS.profile, SEED_PROFILE)

  const sorted = useMemo(() => sortEntries(entries), [entries])
  const name = (profile.name || '').trim() || '未填姓名'
  const targetRole = (profile.targetRole || '').trim()
  const contact = (profile.contact || '').trim()

  return (
    <section className="resume page page-resume">
      <BindingDecor face="resume" />
      <div className="page-module">简历面</div>

      <div className="resume-paper">
        <header className="resume-header">
          <h1 className="resume-name">{name}</h1>
          <div className="resume-sub">
            {targetRole && <span className="resume-role">{targetRole}</span>}
            {targetRole && contact && <span className="resume-sep"> · </span>}
            {contact && <span className="resume-contact">{contact}</span>}
          </div>
        </header>

        <section className="resume-section">
          <h2 className="section-head">经历</h2>
          {sorted.length === 0 ? (
            <p className="empty-hint">还没经历，去「记一条」加几条再来</p>
          ) : (
            <ul className="resume-list">
              {sorted.map((e) => (
                <li key={e.id} className="resume-item">
                  <div className="item-period">
                    {e.startDate} — {e.endDate || '进行中'}
                  </div>
                  <div className="item-main">
                    {(e.org || e.role) && (
                      <div className="item-meta">
                        {e.role && <span className="item-role">{e.role}</span>}
                        {e.role && e.org && <span className="item-sep"> · </span>}
                        {e.org && <span className="item-org">{e.org}</span>}
                      </div>
                    )}
                    <div className="item-content">{e.content}</div>
                    {e.result && (
                      <div className="item-result">成果：{e.result}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  )
}