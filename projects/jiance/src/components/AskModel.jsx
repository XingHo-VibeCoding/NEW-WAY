/**
 * 简册 · 「拿去问 AI」跳转组件（Day 23 新增）
 * ------------------------------------------------------------
 * 干什么：把拼好的提示词**复制到剪贴板**，并**新标签打开**用户选的那家模型官网。
 *        用户在自己熟悉的官网里、用**自己的账号**提问。
 *
 * 🔴 它**不**干什么（这是本组件的设计核心，改之前先读完）：
 *   · **不调模型接口** —— 不发任何请求。源码里不许出现指向模型站的请求。
 *   · **不碰密钥** —— 没有密钥输入框、没有令牌字段、不读不存任何凭据。
 *     登录态与 token 全在「用户 ↔ 官网」之间，简册碰不到。
 *   · **不持久化** —— 提示词只在内存与剪贴板；不写 localStorage / sessionStorage / cookie。
 *   · **不把提示词塞进网址** —— 只走剪贴板。进了 URL 就会落进浏览器历史、`Referer`
 *     和对方服务器日志：用户以为只是复制了一段话，其实被留在三处。
 *
 * ⚠️ 为什么用 `<a target="_blank" rel="noopener noreferrer">` 而不是 `window.open()`：
 *   两者都能开新标签，但 `<a>` 有三个白捡的好处 ——
 *     ① **不会被弹窗拦截**（它是用户点链接的正常导航，不经过弹窗判定）
 *     ② **中键 / 右键「在新标签页打开」照常可用**（用户习惯保留）
 *     ③ 它是**真链接** —— 读屏能识别、能复制地址、没有 JS 也能用
 *   而 `window.open` 要求「必须与点击在同一个调用栈里」，写剪贴板又是异步的，
 *   顺序写反就静默开不出窗口。换成 `<a>` 之后，这一整类坑直接不存在。
 *
 * ⚠️ 必须**自带 CSS 引入**（AGENTS.md 附三第 1 条同款教训）：
 *    漏了这行 → 组件在、样式不在，最难查。
 */
import { useCallback, useRef, useState } from 'react'
import { MODEL_SITES, isAllowedSiteUrl } from '../data/modelSites.js'
import Icon from './Icon.jsx'
import './AskModel.css'

/**
 * 把文本写进剪贴板；写不进去时退回「手动复制」模式。
 *
 * @param {string} text 要复制的文本
 * @param {function(boolean):void} setManual 是否进入手动复制模式
 * @returns {Promise<boolean>} true = 自动复制成功
 */
async function writeClipboard(text, setManual) {
  try {
    /* ⚠️ `navigator.clipboard` 只在**安全上下文**（https 或 localhost）里存在。
       简册线上是 https、本地开发是 localhost，两条路都有；但换台机器、
       换成 http 内网地址就会没有 —— 所以必须兜底，不能假定它一定在。 */
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      throw new Error('当前环境没有剪贴板接口')
    }
    await navigator.clipboard.writeText(text)
    setManual(false)
    return true
  } catch {
    setManual(true)
    return false
  }
}

/**
 * @param {string}  prompt 要交给模型的提示词（拼好的全文）
 * @param {string} [title] 卡片标题，默认「拿去问 AI」
 * @param {string} [note]  标题下面的一句说明
 */
export default function AskModel({ prompt, title = '拿去问 AI', note = '' }) {
  const [status, setStatus] = useState(null) // { ok: boolean, text: string }
  const [manual, setManual] = useState(false)
  const taRef = useRef(null)

  const hasPrompt = typeof prompt === 'string' && prompt.trim() !== ''

  /**
   * 用户点某一家时：先（同步地）让链接跳转，再（异步地）写剪贴板。
   *
   * ⚠️ 顺序说明：这里**不需要**像 window.open 那样抢调用栈 ——
   *    跳转由 `<a href>` 自己完成，onClick 只负责复制。
   *    两者互不阻塞，所以「复制失败但页面照样打开」也是对的：
   *    那时会切到手动复制模式，用户在新标签里按 Ctrl+C 补一下即可。
   */
  const onPick = useCallback(
    (site) => {
      if (!hasPrompt) return
      /* 🔴 跳转前的最后一道闸：地址不在白名单里就**不打开**，并如实说明。
         防的是「将来有人往站点表里塞了一个非官网地址」。 */
      if (!isAllowedSiteUrl(site.chatUrl)) {
        setStatus({ ok: false, text: '这个站点不在白名单里，已拦下。请联系维护者检查站点表。' })
        return
      }
      setStatus({ ok: true, text: '正在把提示词复制到剪贴板…' })
      writeClipboard(prompt, setManual).then((ok) => {
        if (ok) {
          setStatus({
            ok: true,
            text: '提示词已复制。在新打开的 ' + site.name + ' 页面里按 Ctrl+V（Mac 是 ⌘V）粘进输入框就能问。',
          })
        } else {
          setStatus({
            ok: false,
            text: '浏览器不让自动复制。请按 Ctrl+C（Mac 是 ⌘C）手动复制下面的内容，再到 ' + site.name + ' 里粘贴。',
          })
          // 下一帧再全选：此时 textarea 刚渲染出来，ref 才有值
          setTimeout(() => {
            if (taRef.current) {
              taRef.current.focus()
              taRef.current.select()
            }
          }, 0)
        }
      })
    },
    [prompt, hasPrompt],
  )

  return (
    <section className="ask-model" aria-labelledby="ask-model-title">
      <h3 className="ask-model-title" id="ask-model-title">
        <Icon name="external" size={20} />
        {title}
      </h3>

      <p className="ask-model-intro">
        {note !== '' ? (
          note
        ) : (
          <>
            简册<strong>不</strong>替你调模型，也不需要你交出任何密钥 —— 它只做两件事：
            把提示词复制到剪贴板、打开你选的那家官网。你在官网用<strong>自己的账号</strong>问，
            答案由你复制回来。
          </>
        )}
      </p>

      {!hasPrompt && (
        <p className="ask-model-warn" role="status">
          还没有可用的内容 —— 请先把上面的表单填完。
        </p>
      )}

      <ul className="ask-model-grid">
        {MODEL_SITES.map((site) => {
          const allowed = isAllowedSiteUrl(site.chatUrl)
          const usable = hasPrompt && allowed
          return (
            <li key={site.id}>
              {usable ? (
                /* ⚠️ rel="noopener noreferrer" 不是可选项：
                   noopener —— 新页面拿不到 window.opener，防止它用 window.opener.location 把我们这页导航走
                   noreferrer —— 不发 Referer，别把我们页面的地址（可能带 #/resume 这类门牌号）带给对方 */
                <a
                  className="ask-model-card"
                  href={site.chatUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onPick(site)}
                >
                  <SiteInner site={site} />
                </a>
              ) : (
                <span className="ask-model-card is-off" aria-disabled="true">
                  <SiteInner site={site} />
                  <span className="ask-model-off">{allowed ? '先填内容' : '已拦下'}</span>
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {/* 提示词预览：让人**看得见**自己要复制什么，而不是盲信 */}
      {hasPrompt && (
        <details className="ask-model-peek">
          <summary>看看将要复制的内容</summary>
          <pre>{prompt}</pre>
        </details>
      )}

      {/* 状态：role=status 让读屏能念出来（与全站 toast 同一口径） */}
      {status && (
        <p className={'ask-model-status' + (status.ok ? ' is-ok' : ' is-err')} role="status">
          {status.text}
        </p>
      )}

      {/* 兜底：自动复制失败时才出现 */}
      {manual && (
        <div className="ask-model-manual">
          <label className="ask-model-manual-label" htmlFor="ask-model-manual-text">
            手动复制（按 Ctrl+C）
          </label>
          <textarea id="ask-model-manual-text" ref={taRef} readOnly value={prompt} rows={6} />
        </div>
      )}

      <p className="ask-model-foot">
        🔴 提示词里只包含你自己填的经历、你自己粘贴的岗位 JD 和求职偏好 ——
        <strong>联系方式（手机号 / 邮箱）绝不会被拼进来</strong>。
      </p>
    </section>
  )
}

/** 卡片内部（可用态与禁用态共用一份，免得两处长得不一样） */
function SiteInner({ site }) {
  return (
    <>
      <span className="ask-model-badge" style={{ backgroundColor: site.color }} aria-hidden="true">
        {site.badge}
      </span>
      <span className="ask-model-name">{site.name}</span>
      <span className="ask-model-vendor">{site.vendor}</span>
      <span className="ask-model-summary">{site.summary}</span>
    </>
  )
}
