import { useEffect, useState } from 'react'
import './Toast.css'

/**
 * 简册 · 浮动提示（Toast）—— Day 22 新增
 * ------------------------------------------------------------
 * 干什么：一句话告诉用户「刚才那件事成没成」，必要时挂一个「撤销」按钮。
 *
 * 为什么自己写而不用 alert()：
 *   alert 会**卡住整个页面**（不点掉什么都不能干），样式完全不可控，
 *   而且**无头浏览器点不了它的「确定」** —— 自动测试没法模拟，
 *   于是「删除前会问一次」这条永远只能靠人肉点，是个测不到的盲区。
 *
 * ⚠️ 三条无障碍规矩（AGENTS.md 无障碍基线）：
 *   ① `role="status"` + `aria-live="polite"`：屏幕阅读器会念出来。
 *      polite = 「等它把手头这句念完再插播」，不打断用户。
 *   ② **不显示时按钮必须不在 DOM 里**（不是藏起来）。
 *      只藏不卸的话，按钮透明但还在，键盘 Tab 能聚焦到一个看不见的按钮上 ——
 *      Day 11 明确记过这个坑。本组件用**条件渲染**从根上避免：不渲染就没有。
 *   ③ 触控目标 ≥ 24px（见 Toast.css 的 min-height）。
 *
 * ⚠️ 停留时间为什么分 2.6 秒 / 6 秒两档：
 *   纯通知（「已保存」）看一眼就够，2.6 秒不碍事；
 *   带「撤销」的必须给人**看到它 → 决定 → 伸手去点**的时间，
 *   2.6 秒根本来不及，等于没有撤销。所以有动作时延长到 6 秒。
 *
 * ⚠️⚠️ 关于「重新显示」怎么做的（这决定本组件的写法，改之前先读）：
 *   组件**自己不监听 message 变化去重置状态** —— 那是「在 effect 里同步改 state」，
 *   React 官方明确说这是反模式（会多渲染一轮，且容易写出循环）。
 *   改用的办法是：**让调用方给一个 key**。
 *   key 一变，React 把旧组件卸掉、新建一个 —— 新组件的初始状态天然就是「显示中」。
 *   调用方写法：
 *       <Toast key={toast.seq} message={toast.message} action={toast.action} />
 *   每次弹提示 seq 自增 → key 变 → 组件重开 → 倒计时重新开始。
 *   **这是 React 推荐的「重置组件状态」标准做法**（用 key 而不是用 effect）。
 *
 * @param {string} message  要说的话；空值 = 不渲染
 * @param {object} [action] { label: '撤销', onClick: fn }；不传就是纯提示
 */
export default function Toast({ message, action }) {
  // ⚠️ 初值就是 true：组件是「被 key 新建」出来的，一出生就该是显示状态
  const [show, setShow] = useState(true)

  const hasAction = !!(action && typeof action.onClick === 'function')

  useEffect(() => {
    if (!message) return undefined
    // ⚠️ 这里的 setState 发生在**定时器回调**里（异步），不是 effect 体内同步调用 ——
    //    「到点了自己收条」正是这个组件要做的外部同步动作，没有别的地方可放。
    const timer = setTimeout(() => setShow(false), hasAction ? 6000 : 2600)
    return () => clearTimeout(timer)
    /* ⚠️ 依赖只看 message 和 hasAction（布尔值）：
       不要放 action 对象本身 —— 父组件每次重渲染都会新建一个函数对象，
       放进去就会反复重置倒计时，用户读到一半提示自己重来一遍。 */
  }, [message, hasAction])

  if (!message) return null

  return (
    /* ⚠️ 容器**始终留在 DOM 里**（包括收起来之后）：
       aria-live 区域要「先存在、后变内容」，屏幕阅读器才会播报。
       如果连容器一起卸掉，某些屏幕阅读器会漏掉这条消息。
       收起来的状态靠 `.is-show` 控显隐（opacity + pointer-events）。 */
    <div className={`toast ${show ? 'is-show' : ''}`} role="status" aria-live="polite">
      <span className="toast-text">{message}</span>
      {/* ⚠️ 条件是「有动作 **且** 正在显示」——
          收条的过程中按钮已经消失，绝不会留下一个看不见还能 Tab 到的死按钮。 */}
      {hasAction && show && (
        <button
          type="button"
          className="toast-act"
          onClick={() => {
            setShow(false)
            action.onClick()
          }}
        >
          {action.label || '撤销'}
        </button>
      )}
    </div>
  )
}
