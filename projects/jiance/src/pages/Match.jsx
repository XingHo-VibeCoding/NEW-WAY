import { useState } from 'react'
import BindingDecor from '../components/BindingDecor.jsx'
import { useLocalStorage, KEYS } from '../hooks/useLocalStorage.js'
import './Match.css'

/**
 * 简册 · 岗位匹配（简历面 · Day 16 v1.12 · 1:1 简化复刻）
 *
 * 已实现：
 *   - 装订册三件套（灰细线 + 点阵 + "履"印章）
 *   - 卡 1 岗位信息：JD（必填）+ 岗位名称 / 公司 / 城市 / 薪资期望 / 学历要求（选填）
 *   - 卡 2 匹配分析：六维打分（技术栈30 · 经验25 · 行业15 · 学历10 · 薪资10 · 证书10）+ 开场白 + 复制
 *   - 卡 3 匹配记录：快照列表（新的在最前）+ 删除；存 localStorage
 *
 * ⚠️ 本版是「1:1 简化」——AI 通道**尚未接入**，打分由本地演示算法算（不联网）。
 *    真 AI（官方云服务免密钥网关，Day 14 单文件版已实现）迁移 → Day 20。
 *
 * 🔴 红线（秋鹰师 2026-09-29 明令）：
 *   本页**不访问任何招聘网站、不抓取任何他人信息**。
 *   只处理「用户自己粘贴的 JD 文字」+「用户自己填的偏好」。
 *   profile.contact **绝不**进任何 AI 提示词（AGENTS.md 附三第 5 条）。
 */

const DIMENSIONS = [
  { key: 'stack', label: '技术栈', weight: 30 },
  { key: 'exp', label: '经验', weight: 25 },
  { key: 'industry', label: '行业', weight: 15 },
  { key: 'edu', label: '学历', weight: 10 },
  { key: 'salary', label: '薪资', weight: 10 },
  { key: 'cert', label: '证书', weight: 10 },
]

/** 演示用关键词表（本地，不联网）——每组一个「参考上限」，命中数占比即该维分数 */
const KEYWORDS = {
  stack: {
    cap: 8,
    words: ['react', 'vue', 'javascript', 'typescript', 'node', 'python', 'java', 'sql', 'html', 'css', 'agent', 'rag', '大模型', '前端', '后端', '算法'],
  },
  exp: {
    cap: 6,
    words: ['经验', '年', '主导', '负责', '重构', '优化', '上线', '搭建', '设计', '落地'],
  },
  industry: {
    cap: 4,
    words: ['电商', '金融', '教育', '医疗', 'saas', '互联网', '平台', '内容', '游戏', '企业服务'],
  },
  edu: { cap: 3, words: ['本科', '硕士', '博士', '学历', '专业', '统招'] },
  salary: { cap: 3, words: ['k', '薪', '工资', '待遇', '范围', '万'] },
  cert: { cap: 3, words: ['证书', '认证', 'cet', '英语', '托福', '雅思', '资格'] },
}

function scoreOf(key, jdLower) {
  const { cap, words } = KEYWORDS[key]
  const hit = words.filter((w) => jdLower.includes(w)).length
  // 基础分 45（演示口径：从「有个岗位」起步），命中越多越高；上限 96
  const raw = 45 + Math.round((hit / cap) * 51)
  return Math.min(96, raw)
}

/** 演示打分：完全本地、可复现，同一段 JD 每次结果一样 */
function runDemoMatch(form) {
  const jdLower = form.jd.toLowerCase()
  const dims = DIMENSIONS.map((d) => ({ ...d, score: scoreOf(d.key, jdLower) }))
  const total = Math.round(
    dims.reduce((sum, d) => sum + (d.score * d.weight) / 100, 0),
  )
  const weakest = [...dims].sort((a, b) => a.score - b.score)[0]
  const strongest = [...dims].sort((a, b) => b.score - a.score)[0]
  const role = form.title.trim() || '这个岗位'

  const summary = [
    `综合匹配度 ${total} 分。`,
    `最强的是「${strongest.label}」（${strongest.score} 分），JD 里这块的要求和你「记一条」攒的经历对得上。`,
    `最弱的是「${weakest.label}」（${weakest.score} 分），面试前建议补一两句能拿出手的证据。`,
    form.city.trim() ? `工作城市：${form.city.trim()}。` : '',
    form.salary.trim() ? `薪资期望：${form.salary.trim()}，谈的时候按这个区间开口。` : '',
  ]
    .filter(Boolean)
    .join('')

  const opening = `您好，我关注到${form.company.trim() ? form.company.trim() + '的' : ''}${role}。我做过${
    // 开场白引用「最强的维度」而不是编造具体经历
    strongest.label === '技术栈' ? '相关技术栈的项目' : '与岗位相关的实际项目'
  }，和这个岗位的要求比较契合，方便的话想和您聊聊具体职责。`

  return { total, dims, summary, opening }
}

function makeId() {
  return 'ma_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
}

const EMPTY_FORM = {
  jd: '',
  title: '',
  company: '',
  city: '',
  salary: '',
  edu: '',
}

export default function Match() {
  const [matches, setMatches] = useLocalStorage(KEYS.matches, [])
  const [form, setForm] = useState(EMPTY_FORM)
  const [status, setStatus] = useState('idle') // idle | running | ok | err
  const [result, setResult] = useState(null)
  const [formError, setFormError] = useState('')

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const onRun = (e) => {
    e.preventDefault()
    if (!form.jd.trim()) return setFormError('岗位 JD 不能为空，先把职位描述粘进来')
    setFormError('')
    setStatus('running')
    setResult(null)

    // 演示：本地延时 900ms 模拟「分析中」。真 AI 接入后这里换成真实请求（Day 20）。
    window.setTimeout(() => {
      const r = runDemoMatch(form)
      setResult(r)
      setStatus('ok')
      const record = {
        id: makeId(),
        title: form.title.trim() || '（未填岗位名称）',
        company: form.company.trim(),
        city: form.city.trim(),
        salary: form.salary.trim(),
        edu: form.edu.trim(),
        jd: form.jd, // 快照：存全文本，改表单不影响历史
        result: `${r.summary}\n\n【推荐开场白】${r.opening}`,
        model: 'demo-local',
        createdAt: new Date().toISOString(),
      }
      setMatches((prev) => [record, ...prev])
    }, 900)
  }

  const onReset = () => {
    setForm(EMPTY_FORM)
    setFormError('')
    setStatus('idle')
    setResult(null)
  }

  const onCopy = async () => {
    if (!result) return
    const text = `${result.summary}\n\n【推荐开场白】${result.opening}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 剪贴板不可用（非 https / 权限）—— 不抛，用户可手动选文字
    }
  }

  const onDelete = (id) => {
    setMatches((prev) => prev.filter((m) => m.id !== id))
  }

  return (
    <section className="match page page-resume">
      <BindingDecor face="resume" />
      <div className="page-module">简历面</div>

      {/* 卡 1：岗位信息 */}
      <form className="card" onSubmit={onRun}>
        <h2 className="card-title">岗位匹配</h2>
        <p className="card-sub">
          把岗位 JD 粘进来，AI 拿它跟你「记一条」攒下的经历比一比，算出匹配度和开场白
        </p>

        <div className="todo-note">
          <b>怎么用：</b>在招聘网站上找到心仪岗位，<b>你自己</b>把「职位描述」那段文字复制下来，粘进下面的框里。
          简册不会去访问任何招聘网站，也不会碰别人的信息 —— 它只分析<b>你主动交出来的这段文字</b>。
          下面的岗位名称 / 公司 / 城市 / 薪资期望都是选填，只有你自己知道，填了算得更准。
        </div>

        <div className="field">
          <label className="form-key" htmlFor="ma-jd">
            岗位 JD<span className="req">*</span>
            <span className="opt">从招聘网站复制职位描述</span>
          </label>
          <textarea
            id="ma-jd"
            className="match-textarea"
            rows={7}
            maxLength={4000}
            placeholder="例如：负责大模型应用方案设计；要求 5 年以上经验，熟悉 Python、RAG、Agent 开发…"
            value={form.jd}
            onChange={(e) => setField('jd', e.target.value)}
            aria-invalid={formError ? 'true' : undefined}
            aria-describedby={formError ? 'err-ma-jd' : undefined}
          />
        </div>

        <div className="field">
          <label className="form-key" htmlFor="ma-title">
            岗位名称<span className="opt">选填</span>
          </label>
          <input
            id="ma-title"
            type="text"
            maxLength={50}
            placeholder="例如 大模型应用开发工程师"
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
          />
        </div>

        <div className="field">
          <label className="form-key" htmlFor="ma-company">
            公司<span className="opt">选填</span>
          </label>
          <input
            id="ma-company"
            type="text"
            maxLength={50}
            placeholder="例如 某某科技"
            value={form.company}
            onChange={(e) => setField('company', e.target.value)}
          />
        </div>

        <div className="field">
          <label className="form-key" htmlFor="ma-city">
            城市<span className="opt">选填</span>
          </label>
          <input
            id="ma-city"
            type="text"
            maxLength={20}
            placeholder="例如 长沙"
            value={form.city}
            onChange={(e) => setField('city', e.target.value)}
          />
        </div>

        <div className="field">
          <label className="form-key" htmlFor="ma-salary">
            薪资期望<span className="opt">选填</span>
          </label>
          <input
            id="ma-salary"
            type="text"
            maxLength={30}
            placeholder="例如 25-35K"
            value={form.salary}
            onChange={(e) => setField('salary', e.target.value)}
          />
        </div>

        <div className="field">
          <label className="form-key" htmlFor="ma-edu">
            学历要求<span className="opt">选填</span>
          </label>
          <input
            id="ma-edu"
            type="text"
            maxLength={20}
            placeholder="例如 本科及以上"
            value={form.edu}
            onChange={(e) => setField('edu', e.target.value)}
          />
        </div>

        {formError && (
          <p className="field-err" id="err-ma-jd" role="alert">
            {formError}
          </p>
        )}

        <div className="btn-row">
          <button type="submit" className="primary-btn" disabled={status === 'running'}>
            {status === 'running' ? '分析中…' : '开始匹配'}
          </button>
          <button type="button" className="ghost-btn" onClick={onReset}>
            清空重填
          </button>
        </div>
      </form>

      {/* 卡 2：匹配分析 */}
      <div className="card">
        <h2 className="card-title">匹配分析</h2>
        <p className="card-sub">
          按技能口径六维打分：技术栈 30% · 经验 25% · 行业 15% · 学历 10% · 薪资 10% · 证书 10%
        </p>

        <div className="ai-status" role="status" aria-live="polite">
          {status === 'idle' && '还没开始匹配'}
          {status === 'running' && 'AI 正在分析…'}
          {status === 'ok' && `分析完成 · 综合 ${result?.total} 分`}
        </div>

        {status === 'ok' && result && (
          <div className="match-result">
            <div className="dim-list">
              {result.dims.map((d) => (
                <div className="dim-row" key={d.key}>
                  <span className="dim-label">{d.label}</span>
                  <span className="dim-bar" aria-hidden="true">
                    <span className="dim-fill" style={{ width: `${d.score}%` }} />
                  </span>
                  <span className="dim-score">{d.score}</span>
                  <span className="dim-weight">{d.weight}%</span>
                </div>
              ))}
            </div>

            <p className="match-summary">{result.summary}</p>

            <div className="match-opening">
              <div className="opening-head">推荐开场白</div>
              <p className="opening-text">{result.opening}</p>
            </div>
          </div>
        )}

        <div className="btn-row">
          <button
            type="button"
            className="ghost-btn"
            onClick={onCopy}
            disabled={status !== 'ok'}
          >
            复制分析结果
          </button>
        </div>

        <div className="todo-note">
          这只是 AI 的分析参考，投不投、怎么谈，最后都由你定。
          <br />
          <span className="demo-flag">
            ⚠️ 本版为演示：打分由本地演示算法算出（不联网），真 AI 通道在 Day 20 接入。
          </span>
        </div>
      </div>

      {/* 卡 3：匹配记录 */}
      <div className="card">
        <h2 className="card-title">匹配记录</h2>
        <p className="card-sub">每匹配一次存一条，只存在你这台电脑上</p>

        {matches.length === 0 ? (
          <p className="empty-hint">还没有匹配记录</p>
        ) : (
          <ul className="match-ul">
            {matches.map((m) => (
              <li className="match-item" key={m.id}>
                <div className="match-item-main">
                  <div className="match-item-title">{m.title}</div>
                  <p className="match-item-meta">
                    {[m.company, m.city, m.salary].filter(Boolean).join(' · ') || '未填公司 / 城市 / 薪资'}
                    {' · '}
                    {new Date(m.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>
                <button
                  type="button"
                  className="row-del"
                  onClick={() => onDelete(m.id)}
                  aria-label={`删除匹配记录 ${m.title}`}
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
