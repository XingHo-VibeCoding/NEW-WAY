import { useMemo, useState } from 'react'
import BindingDecor from '../components/BindingDecor.jsx'
import Icon from '../components/Icon.jsx'
import AskModel from '../components/AskModel.jsx'
import CrossLink from '../components/CrossLink.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
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
 *   - **「拿去问 AI」**（Day 23 新增）：把经历拼成提示词 → 复制 + 打开官网
 *   - **「AI 改写稿回填」**（Day 24 新增）：把官网给的结果**粘回简册**，
 *     逐条对照原稿、可「采用」可「换回」—— 把 Day 23 断掉的闭环接上。
 *
 * 【为什么回填区在**纸外面】**：`.resume-paper` 是**可打印成品**（PRD 验收要求
 *   「能用浏览器打印打出简历」）。编辑控件放进纸里，要么被印到纸上、要么得靠
 *   打印规则去藏 —— 那是治标。**结构上就不该混进纸张里**。
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
  const [entries, setEntries] = useLocalStorage(KEYS.entries, SEED_ENTRIES)
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

  /* ================================================================
     Day 24 · AI 改写稿回填（把 Day 23 断掉的闭环接上）
     ----------------------------------------------------------------
     原来的路走不通：官网给了改写结果 → 简册里**没有地方放**，
     用户只能自己回到「记一条」一个字一个字改。

     这里做三件事：**粘进来 → 对照着看 → 决定用不用**。

     ⚠️ 两个字段都只加在**本机抽屉**里（entries 数组的每一条上），不动云端表结构：
        · `aiRewrite` —— 待采用的改写稿（还没进正文）
        · `aiPrev`    —— 采用后留着的"上一版正文"，给「换回」用
        **不删用户的东西**：采用和换回是**互逆**的，两个方向都不丢字。
        改「采用」/「换回」的实现时，务必保住这条对称性。
     ================================================================ */
  const [openId, setOpenId] = useState(null) // 正在粘哪一条
  const [draft, setDraft] = useState('') // 那一条的粘贴内容
  const [confirmAdopt, setConfirmAdopt] = useState(null) // 待确认"采用"的那一条

  /** 把粘进来的文字存成这一条的「改写稿」（只存，不动正文） */
  const saveRewrite = (entry) => {
    const text = draft.trim()
    if (text === '') return
    setEntries((list) =>
      list.map((x) =>
        x.id === entry.id ? { ...x, aiRewrite: text, updatedAt: new Date().toISOString() } : x,
      ),
    )
    setOpenId(null)
    setDraft('')
  }

  /** 丢弃改写稿（正文没动过，丢了也没损失） */
  const discardRewrite = (entry) => {
    setEntries((list) =>
      list.map((x) => {
        if (x.id !== entry.id) return x
        const next = { ...x }
        delete next.aiRewrite
        next.updatedAt = new Date().toISOString()
        return next
      }),
    )
  }

  /** 采用改写稿：正文换成改写稿，**旧正文挪进 aiPrev 留着**（可换回） */
  const adoptRewrite = (entry) => {
    setEntries((list) =>
      list.map((x) => {
        if (x.id !== entry.id) return x
        const next = { ...x }
        next.aiPrev = x.content
        next.content = x.aiRewrite
        delete next.aiRewrite
        next.updatedAt = new Date().toISOString()
        return next
      }),
    )
    setConfirmAdopt(null)
  }

  /** 换回上一版：正文换回去，**被换下来的那版重新变成"待采用的改写稿"**（可再采用） */
  const revertAdopt = (entry) => {
    setEntries((list) =>
      list.map((x) => {
        if (x.id !== entry.id) return x
        const next = { ...x }
        next.aiRewrite = x.content
        next.content = x.aiPrev
        delete next.aiPrev
        next.updatedAt = new Date().toISOString()
        return next
      }),
    )
  }

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

      {/* ---------- Day 24 · AI 改写稿回填（把 Day 23 断掉的闭环接上）----------
          ⚠️ 也放在 `.resume-paper` **外面**：纸是"已确认的成品"，
             改写稿是"待定的候选" —— 两者不该混在一张纸上。
          ⚠️ 编号与上面提示词里的编号**用的是同一个 sorted 顺序**，
             所以「提示词第 3 条」和「这里第 3 条」是同一条，用户能一一对上。
          ⚠️ **不做自动解析**：不猜模型的回复里哪段对应哪条。
             猜错会把 A 的改写塞进 B，比让用户自己挑麻烦得多。 */}
      {sorted.length > 0 && (
        <section className="rewrite-back" aria-labelledby="rewrite-title">
          <h3 className="rewrite-title" id="rewrite-title">
            <Icon name="edit" size={20} />
            把 AI 改写的结果粘回来
          </h3>
          <p className="rewrite-intro">
            把官网给的那段回复，挑出属于某一编经历的文字，粘到对应那条下面。
            存下来的叫「改写稿」，<b>不会动你的原文</b>；要不要用，你自己按「采用」。
          </p>

          <ul className="rewrite-list">
            {sorted.map((e, i) => (
              <li className="rewrite-row" key={e.id}>
                <div className="rewrite-head">
                  <span className="rewrite-no" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="rewrite-who">{e.org || e.role || '（未填公司 / 角色）'}</span>
                </div>
                <p className="rewrite-orig">{e.content}</p>

                {/* ① 有改写稿：并排对照 + 采用 / 丢弃 */}
                {e.aiRewrite ? (
                  <div className="rewrite-cand">
                    <div className="rewrite-cand-label">改写稿（还没采用）</div>
                    <p className="rewrite-cand-text">{e.aiRewrite}</p>
                    <div className="rewrite-actions">
                      <button
                        type="button"
                        className="rw-btn is-primary"
                        onClick={() => setConfirmAdopt(e)}
                      >
                        采用这一版
                      </button>
                      <button type="button" className="rw-btn" onClick={() => discardRewrite(e)}>
                        丢弃
                      </button>
                    </div>
                  </div>
                ) : openId === e.id ? (
                  /* ② 正在粘：一个 textarea + 存 / 取消 */
                  <div className="rewrite-form">
                    <label className="rewrite-label" htmlFor={'rw-' + e.id}>
                      把 AI 针对这一条写的结果粘进来
                    </label>
                    <textarea
                      id={'rw-' + e.id}
                      className="rewrite-input"
                      rows={3}
                      value={draft}
                      onChange={(ev) => setDraft(ev.target.value)}
                    />
                    <div className="rewrite-actions">
                      <button
                        type="button"
                        className="rw-btn is-primary"
                        onClick={() => saveRewrite(e)}
                        disabled={draft.trim() === ''}
                      >
                        存为改写稿
                      </button>
                      <button
                        type="button"
                        className="rw-btn"
                        onClick={() => {
                          setOpenId(null)
                          setDraft('')
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ③ 空闲：一个入口按钮 */
                  <button
                    type="button"
                    className="rw-open"
                    onClick={() => {
                      setOpenId(e.id)
                      setDraft('')
                    }}
                  >
                    ＋ 粘回这一条的改写稿
                  </button>
                )}

                {/* 已采用过：给一个"换回上一版"（与"采用"互逆，两个方向都不丢字） */}
                {e.aiPrev && (
                  <div className="rewrite-prev">
                    <span className="rewrite-prev-text">上一版：{e.aiPrev}</span>
                    <button type="button" className="rw-btn" onClick={() => revertAdopt(e)}>
                      换回上一版
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* C 方案联动：简历准备好了，下一件事通常是"拿去匹配岗位"（跨面） */}
      <CrossLink to="/match" hint="把岗位 JD 粘进去，看这份简历跟它合不合、开场白怎么写">
        简历准备好了，去岗位匹配
      </CrossLink>

      {/* 「采用」会改正文，所以先问一句（复用全站那个确认弹层，弹层三件套齐全） */}
      <ConfirmDialog
        open={!!confirmAdopt}
        title="采用这一版改写稿？"
        text={
          confirmAdopt
            ? '这一条的正文会换成改写稿。原来的正文会留成「上一版」，之后可以一键换回 —— 不会丢。'
            : ''
        }
        confirmLabel="采用"
        onConfirm={() => adoptRewrite(confirmAdopt)}
        onCancel={() => setConfirmAdopt(null)}
      />
    </section>
  )
}