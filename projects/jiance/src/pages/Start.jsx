import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SceneTransition from '../components/SceneTransition.jsx'
import './Start.css'

/**
 * 简册 · 主界面（卡牌台 · 唯一入口 · 默认落地页 · v1.12 Day 16 补全）
 *
 * 已实现：
 *   - 5 张牌沿浅弧排列 + 鼠标跟随倾斜
 *   - 点击牌 → 显示场景动画 ~900ms → 跳页（守"新页零动效"纪律）
 *
 * 仍推 Day 17+：牌的入场发牌序列（按栏线落笔顺序入场）
 */
const CARDS = [
  { id: 'home', label: '底牌页', tag: '账簿面', target: '/home' },
  { id: 'expense', label: '记一笔', tag: '账簿面', target: '/expense' },
  { id: 'entry', label: '记一条', tag: '简历面', target: '/entry' },
  { id: 'resume', label: '简历预览', tag: '简历面', target: '/resume' },
  { id: 'match', label: '岗位匹配', tag: '简历面', target: '/match' },
]

/** scene 演完后跳哪页（900ms） */
const SCENE_DURATION_MS = 900

export default function Start() {
  const navigate = useNavigate()
  const arcRef = useRef(null)
  const [scene, setScene] = useState(null) // {face, target} 或 null

  // 鼠标跟随台面倾斜（克制：整张台面 1° 左右，不抢牌的风头）
  useEffect(() => {
    const arc = arcRef.current
    if (!arc) return
    const onMove = (e) => {
      const rect = arc.getBoundingClientRect()
      const dx = (e.clientX - rect.left - rect.width / 2) / rect.width
      const dy = (e.clientY - rect.top - rect.height / 2) / rect.height
      arc.style.setProperty('--tilt-x', `${dx * 1.2}deg`)
      arc.style.setProperty('--tilt-y', `${-dy * 1.2}deg`)
    }
    const onLeave = () => {
      arc.style.setProperty('--tilt-x', '0deg')
      arc.style.setProperty('--tilt-y', '0deg')
    }
    arc.addEventListener('mousemove', onMove)
    arc.addEventListener('mouseleave', onLeave)
    return () => {
      arc.removeEventListener('mousemove', onMove)
      arc.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // 场景演完才跳页（瞬间到位，零页面动效）
  useEffect(() => {
    if (!scene) return
    const t = setTimeout(() => {
      navigate(scene.target)
      setScene(null)
    }, SCENE_DURATION_MS)
    return () => clearTimeout(t)
  }, [scene, navigate])

  const onCardClick = (card) => {
    setScene({ face: card.id, target: card.target })
  }

  return (
    <section className="start" aria-label="主界面">
      <div className="start-cover">
        <div className="start-eyebrow">简册 · Ledger and Career</div>
        <h1 className="start-title">今天想做什么</h1>
        <p className="start-hint">
          点一张牌 —— 左边是记账，右边是写简历
        </p>

        <div className="start-arc" ref={arcRef}>
          {CARDS.map((card, i) => (
            <button
              key={card.id}
              type="button"
              className="card"
              style={{ '--i': i }}
              onClick={() => onCardClick(card)}
            >
              <span className="card-tag">{card.tag}</span>
              <span className="card-label">{card.label}</span>
            </button>
          ))}
        </div>

        <div className="start-foot">
          点牌 → 牌心场景演 ~900ms → 进页；其它页只有一个入口：回到这里
        </div>
      </div>

      {scene && <SceneTransition face={scene.face} />}
    </section>
  )
}