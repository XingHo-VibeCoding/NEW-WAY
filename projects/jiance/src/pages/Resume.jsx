import { useMemo } from 'react'
import BindingDecor from '../components/BindingDecor.jsx'
import Icon from '../components/Icon.jsx'
import AskModel from '../components/AskModel.jsx'
import { useLocalStorage, KEYS } from '../hooks/useLocalStorage.js'
import { buildOptimizePrompt } from '../data/prompts.js'
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
 *   - **「拿去问 AI」**（Day 23 新增）：把经历拼成提示词 → 复制 + 打开官网，
 *     让用户在官网用**自己的账号**改写简历。简册**不调模型、不碰密钥**。
 *
 * 仍推 Day 19：
 *   - 真玻璃效果（@supports backdrop-filter + blur(14px) + 半透明深色）
 *   - 装订册以外的红印章「履」/ 描边 / 88px 撑满等
 *
 * 🔴 个人信息红线：
 *   profile.contact 仅在本页**渲染**用，**绝不**进任何提示词 ——
 *   `buildOptimizePrompt` 的入参里**根本没有 contact 这个字段**，传不进来
 *   （AGENTS.md 附三第 4 / 5 条）。⚠️ 改这个函数时必须重新确认这条。
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

  /* 给模型的那段话。
     ⚠️ 入参只有 `entries` 与 `targetRole` —— **`contact` 传不进去**（红线见文件头）。
     ⚠️ 用 sorted 而不是 entries：让提示词里的经历顺序和纸上看到的一致。 */
  const askPrompt = useMemo(
    () => buildOptimizePrompt({ entries: sorted, targetRole }),
    [sorted, targetRole],
  )

  return (
    <section className="resume page page-resume">
      <BindingDecor face="resume" />
      <div className="page-module">简历面</div>

      <div className="resume-paper">
        <header className="resume-header">
          <div className="resume-mark">
            <Icon name="seal" size={44} label="简历标记" />
          </div>
          <h1 className="resume-name">{name}</h1>
          <div className="resume-sub">
            {targetRole && <span className="resume-role">{targetRole}</span>}
            {targetRole && contact && <span className="resume-sep"> · </span>}
            {contact && <span className="resume-contact">{contact}</span>}
          </div>
        </header>

        <section className="resume-section">
          <h2 className="section-head section-mark">
            <Icon name="section" size={20} />
            经历
          </h2>
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

      {/* 「拿去问 AI」（Day 23 新增）
          ⚠️ 刻意放在 `.resume-paper` **外面**：纸上是简历成品，这一块是操作工具。
             虽然 index.css 的打印总闸也会把它撕掉，但结构上也不该混进纸张里。
          ⚠️ 故意**不**再套一层 `.card`：这一页的视觉主角是那张纸，
             再给一个同级的卡片会和它抢注意力（岗位匹配页是卡片堆，那边就套了）。
          ⚠️ 一条经历都没有时传空串 —— 卡片会显示「先填内容」而不是让人问一份空简历。 */}
      <AskModel
        prompt={sorted.length === 0 ? '' : askPrompt}
        title="拿去问 AI（简册不代你调模型）"
        note="选一家你惯用的官网，简册会把你这几条经历拼成的提示词复制到剪贴板并打开它 —— 你在那边用自己的账号让它改写。简册不接触你的任何密钥。"
      />
    </section>
  )
}