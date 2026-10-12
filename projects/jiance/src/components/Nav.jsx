import { NavLink, useLocation } from 'react-router-dom'
import './Nav.css'

/**
 * 简册 · 顶部导航
 * ------------------------------------------------------------
 * 📌 Day 24 改版（B 方案）：导航条从「只有一个主界面按钮」改为**按面分组**。
 *
 * 【为什么改】原来要"回主界面 → 翻牌 → 牌心演 900ms"才能换页，
 *   从「简历预览」去「岗位匹配」得走三步加一秒。用户反馈"太麻烦"。
 *
 * 【怎么改】按**六个门牌号归属的哪一个面**分组显示：
 *   · 在账簿面页面（底牌页 / 记一笔）→ 显示 `主界面 | 账簿面 底牌页 记一笔`
 *   · 在简历面页面（记一条 / 简历预览 / 岗位匹配）→ 显示 `主界面 | 简历面 记一条 简历预览 岗位匹配`
 *   · 在**主界面**上 → 仍然只有「主界面」一个按钮（卡牌台的仪式感留给它）
 *
 * 【为什么只给"同面"的兄弟，不给全部六个】
 *   简册的人格是"一本双面账簿"——两面各成一体。把六个全铺开，
 *   等于把这个隐喻抹平，变成普通的菜单栏。同面内直达 + 跨面回主界面，
 *   既解决了 80% 的穿梭痛，又保住了产品叙事。
 *   （跨面那 20% 由各页的**语义化联动按钮**补，那是 C 方案，见各页注释。）
 *
 * ⚠️ **场景穿越动画不在这里**：它只属于「从主界面点牌进门」那一下。
 *    从导航条切页是捷径，不该让用户每次等 1.1 秒。见 `Start.jsx`。
 *
 * ⚠️ 门牌号与归属面这张表**要和 `AGENTS.md` 附三第 2 条保持一致** ——
 *    那边是口径的出处，这边是实现。改一处要改两处。
 */

/** 五个功能页 + 各自归属哪一面（主界面不属于任何面，单独处理） */
const PAGES = [
  { to: '/home', label: '底牌页', face: 'ledger' },
  { to: '/expense', label: '记一笔', face: 'ledger' },
  { to: '/entry', label: '记一条', face: 'resume' },
  { to: '/resume', label: '简历预览', face: 'resume' },
  { to: '/match', label: '岗位匹配', face: 'resume' },
]

const FACE_LABEL = { ledger: '账簿面', resume: '简历面' }

export default function Nav() {
  const { pathname } = useLocation()

  // 当前在哪一页？找不到（比如停在 #/start 或一个没登记过的地址）就没有"同面兄弟"
  const current = PAGES.find((p) => p.to === pathname)
  const siblings = current ? PAGES.filter((p) => p.face === current.face) : []

  return (
    <nav className="nav" aria-label="顶部导航">
      {/* 主界面按钮恒在，且永远排第一 —— 它是"回家"的路 */}
      <NavLink to="/start" end className={({ isActive }) => 'nav-btn' + (isActive ? ' is-active' : '')}>
        主界面
      </NavLink>

      {current && (
        <>
          <span className="nav-sep" aria-hidden="true" />
          {/* 这一小段是"你现在在哪一面"的位置感，屏幕阅读器可以跳过 */}
          <span className="nav-face" aria-hidden="true">
            {FACE_LABEL[current.face]}
          </span>
          {siblings.map((p) => (
            /* ⚠️ 这里**不加** `aria-current={undefined}`（旧代码加过）——
               NavLink 自己在匹配时会给 `aria-current="page"`，
               那正是 AGENTS.md 附三第 2 条无障碍基线要求的。手动抹掉是帮倒忙。 */
            <NavLink
              key={p.to}
              to={p.to}
              className={({ isActive }) => 'nav-btn' + (isActive ? ' is-active' : '')}
            >
              {p.label}
            </NavLink>
          ))}
        </>
      )}
    </nav>
  )
}
