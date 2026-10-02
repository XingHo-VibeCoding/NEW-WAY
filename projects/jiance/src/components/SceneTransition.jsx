/**
 * 简册 · 场景穿越（Day 16 v1.12 补全）
 *
 * 5 张牌心各自的小戏剧（900ms）。演完由父组件 navigate 到目标页。
 *
 * 父组件用法（Start.jsx 里）：
 *   const [scene, setScene] = useState(null)
 *   const onCardClick = (target) => setScene({ face: faceOf(target), target })
 *   useEffect(() => {
 *     if (!scene) return
 *     const t = setTimeout(() => { navigate(scene.target); setScene(null) }, 900)
 *     return () => clearTimeout(t)
 *   }, [scene])
 *   ...
 *   {scene && <SceneTransition face={scene.face} />}
 *
 * ⚠️ 必须自带 CSS 引入：漏了这行，5 个场景的 @keyframes 全都不会加载，
 *    牌心只会出现几个无样式元素（组件看起来「写好了」其实什么也没演）。
 */
import './SceneTransition.css'

export default function SceneTransition({ face = 'home' }) {
  return (
    <div className="scene" aria-hidden="true">
      <div className={`scene-card scene-${face}`}>
        {face === 'home' && <SceneHome />}
        {face === 'expense' && <SceneExpense />}
        {face === 'entry' && <SceneEntry />}
        {face === 'resume' && <SceneResume />}
        {face === 'match' && <SceneMatch />}
      </div>
    </div>
  )
}

/* === 5 个场景 SVG === */

/** 账本翻开：栏线 + 中缝 + 3 条文本线 */
function SceneHome() {
  return (
    <svg viewBox="0 0 100 60" className="scene-svg">
      {/* 中缝 */}
      <line
        x1="50"
        y1="6"
        x2="50"
        y2="54"
        className="scene-line scene-spine"
      />
      {/* 左页栏线 */}
      <line
        x1="8"
        y1="14"
        x2="46"
        y2="14"
        className="scene-line scene-rule-l"
      />
      <line
        x1="8"
        y1="22"
        x2="46"
        y2="22"
        className="scene-line scene-rule-l"
      />
      <line
        x1="8"
        y1="30"
        x2="46"
        y2="30"
        className="scene-line scene-rule-l"
      />
      {/* 右页栏线 */}
      <line
        x1="54"
        y1="14"
        x2="92"
        y2="14"
        className="scene-line scene-rule-r"
      />
      <line
        x1="54"
        y1="22"
        x2="92"
        y2="22"
        className="scene-line scene-rule-r"
      />
      <line
        x1="54"
        y1="30"
        x2="92"
        y2="30"
        className="scene-line scene-rule-r"
      />
    </svg>
  )
}

/** 笔划过纸面：纸边 + 朱色笔尖 + 划痕 */
function SceneExpense() {
  return (
    <svg viewBox="0 0 100 60" className="scene-svg">
      {/* 纸边 */}
      <rect
        x="10"
        y="10"
        width="80"
        height="40"
        fill="none"
        className="scene-paper"
      />
      {/* 划痕 */}
      <path
        d="M 14 22 Q 40 18 60 24 T 86 22"
        fill="none"
        className="scene-stroke"
      />
      <path
        d="M 14 32 Q 40 28 60 34 T 86 32"
        fill="none"
        className="scene-stroke"
      />
      <path
        d="M 14 42 Q 40 38 60 44 T 86 42"
        fill="none"
        className="scene-stroke"
      />
    </svg>
  )
}

/** 打印纸落下：白纸 + 三条朱色横线 */
function SceneEntry() {
  return (
    <svg viewBox="0 0 100 60" className="scene-svg">
      <rect
        x="22"
        y="6"
        width="56"
        height="48"
        fill="#f3e7c8"
        className="scene-print"
      />
      <line x1="30" y1="18" x2="70" y2="18" className="scene-print-line" />
      <line x1="30" y1="28" x2="70" y2="28" className="scene-print-line" />
      <line x1="30" y1="38" x2="70" y2="38" className="scene-print-line" />
    </svg>
  )
}

/** 纸面展开：左右两半从中心向两侧 */
function SceneResume() {
  return (
    <div className="scene-fold">
      <div className="scene-fold-l"></div>
      <div className="scene-fold-r"></div>
      <div className="scene-fold-spine"></div>
    </div>
  )
}

/** 雷达图辐射：中心环 + 6 条线 + 6 个点 */
function SceneMatch() {
  const rays = [0, 60, 120, 180, 240, 300]
  return (
    <svg viewBox="0 0 100 60" className="scene-svg">
      <circle
        cx="50"
        cy="30"
        r="22"
        fill="none"
        className="scene-radar-ring"
      />
      <circle
        cx="50"
        cy="30"
        r="14"
        fill="none"
        className="scene-radar-ring scene-radar-ring-inner"
      />
      {rays.map((deg, i) => {
        const rad = (deg * Math.PI) / 180
        const x2 = 50 + 22 * Math.cos(rad)
        const y2 = 30 + 22 * Math.sin(rad)
        return (
          <g key={i}>
            <line
              x1="50"
              y1="30"
              x2={x2}
              y2={y2}
              className={`scene-radar-ray scene-radar-ray-${i}`}
            />
            <circle
              cx={x2}
              cy={y2}
              r="2"
              className={`scene-radar-dot scene-radar-dot-${i}`}
            />
          </g>
        )
      })}
      <circle cx="50" cy="30" r="3" className="scene-radar-core" />
    </svg>
  )
}