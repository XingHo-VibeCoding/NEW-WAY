/**
 * 简册 · 跨面联动按钮（Day 24 新增 · 导航改造的 C 方案）
 * ------------------------------------------------------------
 * 干什么：在页面上给"下一步"一个明确的去处，而且**带上语义**。
 *
 * 【为什么要有它】导航条只给"同面的兄弟页"（B 方案），
 *   跨面仍然要回主界面。但有些跨面动作是**有方向的、能一句话说清的**：
 *     · 底牌页试算完 → 「去比一个岗位」
 *     · 岗位匹配算完 → 「看看这份 offer 能不能接」
 *     · 简历准备好了 → 「去岗位匹配看看合不合」
 *   这类跳转不该让用户自己想"我该回主界面点哪张牌"。
 *
 * 【为什么抽成组件，而不是三个页面各写一个】
 *   同一个东西出现在三个地方，三份拷贝必然长歪（字号、间距、箭头方向各不一样）。
 *   一个组件 + 一处样式，改一次三处都对。
 *
 * ⚠️ 它**不是**导航条：不做"当前页高亮"，因为它表达的是一次动作，不是一个位置。
 * ⚠️ 必须自带 CSS 引入（AGENTS.md 附三第 1 条同款教训：漏了就"组件在、样式不在"）。
 */
import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import './CrossLink.css'

/**
 * @param {string} to       目标门牌号（如 '/match'）
 * @param {string} children 按钮正文（一句话说清"过去的下一步是什么"）
 * @param {string} [hint]   小字补充（选填，解释为什么去那儿）
 */
export default function CrossLink({ to, children, hint = '' }) {
  return (
    <Link className="cross-link" to={to}>
      <span className="cross-link-body">
        <span className="cross-link-text">{children}</span>
        {hint !== '' && <span className="cross-link-hint">{hint}</span>}
      </span>
      {/* 箭头是装饰，别让读屏念出来 */}
      <Icon name="arrow" size={18} />
    </Link>
  )
}
