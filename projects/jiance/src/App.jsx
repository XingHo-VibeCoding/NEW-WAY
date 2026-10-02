import { Routes, Route } from 'react-router-dom'
import Start from './pages/Start.jsx'
import Home from './pages/Home.jsx'
import Expense from './pages/Expense.jsx'
import Entry from './pages/Entry.jsx'
import Resume from './pages/Resume.jsx'
import Match from './pages/Match.jsx'
import Nav from './components/Nav.jsx'
import './App.css'

/**
 * 简册 · 简版路由（Day 15 骨架）
 * 完整视觉（双面 UI / 装订册三件套 / 场景穿越动画 / 联动板块① / AI 通道）
 * 推到 Day 16-20 复刻。今天先把路由 + 卡牌台 + 5 个占位页跑通。
 */
function App() {
  return (
    <div className="app">
      <Nav />
      <main className="pages">
        <Routes>
          <Route path="/" element={<Start />} />
          <Route path="/start" element={<Start />} />
          <Route path="/home" element={<Home />} />
          <Route path="/expense" element={<Expense />} />
          <Route path="/entry" element={<Entry />} />
          <Route path="/resume" element={<Resume />} />
          <Route path="/match" element={<Match />} />
        </Routes>
      </main>
    </div>
  )
}

export default App