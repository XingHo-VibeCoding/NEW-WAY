import { useEffect, useRef } from 'react'
import './ConfirmDialog.css'

/**
 * 简册 · 确认弹层（ConfirmDialog）—— Day 22 新增
 * ------------------------------------------------------------
 * 干什么：危险操作（删一笔账）之前问一句「真的要删吗」，点「确认」才往下走。
 *
 * 为什么不用浏览器自带的 window.confirm()：
 *   ① 它会**卡住整个页面**（模态阻塞），样式完全不可控，与简册的账簿面材质格格不入；
 *   ② **无头浏览器点不了它** —— 自动测试没法模拟「点确定」，
 *      于是「删除前会问一次」这条永远只能靠人肉点，是个测不到的盲区。
 *   自己画的弹层能把「问过了」这件事变成可断言的。
 *
 * ⚠️ 弹层三件套（AGENTS.md 无障碍基线硬要求，缺一不可）：
 *   ① **还焦点**：关掉之后，把焦点还给「打开它之前那个元素」。
 *      不还的话焦点会留在已经消失的「确认」按钮上，
 *      用键盘的人下一步 Tab 会从页面最开头重走一遍（旧单文件版体检时修的坑）。
 *   ② **锁滚动**：弹层开着时给 body 加 `.is-modal-open`（overflow:hidden），
 *      否则在手机上滑动弹层会连带把背后的页面滚走。
 *   ③ **Tab 循环**：键盘在弹层的按钮之间转圈，不许跑到背景页去 ——
 *      背景页此时在视觉上被盖住了，焦点跑过去就是「看不见但能操作」。
 *
 * ⚠️ 焦点归还为什么要 `setTimeout(..., 0)` 延后一拍：
 *   点「确认」后父组件会立刻执行删除、列表会重渲染，
 *   **触发弹层的那个「删除」按钮很可能连同这一行一起消失了**。
 *   直接 focus 一个已经不在文档里的元素 = 静默失败（焦点掉回页面顶部）。
 *   所以延后一拍，等 DOM 更新完再挑一个**还在的**元素接住焦点（见下方挑选顺序）。
 *
 * @param {boolean}  open        是否显示
 * @param {string}   title       标题（例「确认删除？」）
 * @param {string}   text        正文（要把「删的是哪一条」说清楚）
 * @param {string}   [confirmLabel] 确认按钮文字
 * @param {Function} onConfirm   点确认
 * @param {Function} onCancel    点取消 / Esc / 点灰底
 * @param {object}   [fallbackRef] 还焦点时的兜底目标（一般是列表容器，需可聚焦）
 */
export default function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel = '确认',
  onConfirm,
  onCancel,
  fallbackRef,
}) {
  const okRef = useRef(null)
  const dialogRef = useRef(null)
  // 打开弹层之前焦点在哪 —— 关掉之后要还回去
  const returnFocusRef = useRef(null)

  /* ---- 打开 / 关闭的门帘：锁滚动 + 焦点进出 ---- */
  useEffect(() => {
    if (!open) return undefined

    returnFocusRef.current = document.activeElement
    /* ⚠️ 兜底元素在**打开这一刻**就取出来存成局部变量，不在清理函数里读 ref。
       两个原因：
         ① ref 的 `.current` 在清理阶段可能已经指向别的元素（甚至 null），
           那时再读拿到的不一定是当初那个 —— 这是一种真实的时序 bug，
           不只是 lint 挑刺；
         ② 兜底目标（列表容器）在整个删除流程里**一直是同一个 DOM 节点**
           （删除只换它里面的行，不换容器本身），所以提前取出来完全安全。 */
    const fallbackEl = fallbackRef ? fallbackRef.current : null
    document.body.classList.add('is-modal-open')
    // 焦点直接落在「确认」上：键盘用户敲回车就能决定，
    // 不用先 Tab 一遍。⚠️ 落在「确认」而不是「取消」：这是危险操作，
    // 默认焦点放在立即生效的那个更符合「你点了删除，那就确认」的预期；
    // 想反悔的人按 Esc 或 Tab 一格就到「取消」。
    okRef.current?.focus()

    return () => {
      document.body.classList.remove('is-modal-open')

      const back = returnFocusRef.current
      returnFocusRef.current = null

      /* 延后一拍再还焦点（理由见组件头部的说明）。
         挑选顺序：原本那个按钮 → 调用方给的兜底容器。
         ⚠️ 判定「能不能接焦点」必须查**真的画出来了没有**（getComputedStyle），
            不能只查 hidden 属性 —— Day 13 踩过：列表是靠 CSS 藏起来的，
            属性查不到，于是给隐藏元素设焦点、静默失败、焦点掉回页顶。
         ⚠️ body 不算合格目标：触摸屏上点按钮常常不让它拿到焦点，
            这时 activeElement 就是 body，focus(body) 等于什么都没做。 */
      setTimeout(() => {
        const usable = (el) =>
          !!el &&
          el !== document.body &&
          document.contains(el) &&
          window.getComputedStyle(el).display !== 'none' &&
          window.getComputedStyle(el).visibility !== 'hidden'

        const target = [back, fallbackEl].find(usable)
        if (target) target.focus()
      }, 0)
    }
  }, [open, fallbackRef])

  /* ---- 键盘规矩：Esc 取消；Tab / Shift+Tab 在弹层内转圈 ---- */
  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key !== 'Tab') return

      // 自己接管 Tab（不让浏览器默认走），只在本弹层的按钮之间循环
      const items = dialogRef.current
        ? Array.from(dialogRef.current.querySelectorAll('button:not([disabled])'))
        : []
      if (items.length === 0) return

      e.preventDefault()
      const first = items[0]
      const last = items[items.length - 1]
      const at = items.indexOf(document.activeElement)

      let next
      if (e.shiftKey) {
        next = at <= 0 ? last : items[at - 1]
      } else {
        next = at === -1 || at === items.length - 1 ? first : items[at + 1]
      }
      next.focus()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="confirm-mask"
      // 点灰底 = 取消。但点弹层内部不该关（e.target === e.currentTarget 才是灰底本身）
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="confirm-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-text"
        ref={dialogRef}
      >
        <h3 className="confirm-title" id="confirm-title">{title}</h3>
        <p className="confirm-text" id="confirm-text">{text}</p>
        <div className="confirm-btns">
          <button type="button" className="confirm-btn" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="confirm-btn is-danger" ref={okRef} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
