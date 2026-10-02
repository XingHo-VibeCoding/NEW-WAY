import { NavLink } from 'react-router-dom'
import './Nav.css'

/**
 * 简册 · 顶部导航
 * Day 15 纪律（已拍板）：导航条**只剩一个「主界面」按钮**。
 * 底牌页的"记一笔 / 记一条"两个大按钮**已收掉**——任何页面要进其他页面
 * 必须先回主界面再点对应牌。
 */
export default function Nav() {
  return (
    <nav className="nav" aria-label="顶部导航">
      <NavLink
        to="/start"
        end
        className={({ isActive }) =>
          'nav-btn' + (isActive ? ' is-active' : '')
        }
        aria-current={undefined}
      >
        主界面
      </NavLink>
    </nav>
  )
}