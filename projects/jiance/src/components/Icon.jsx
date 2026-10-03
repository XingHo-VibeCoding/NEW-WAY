/**
 * 简册 · 图标库（v1.12 · 线条图标）
 *
 * 为什么用代码画的 SVG 而不是图片文件：
 * ① 项目铁律「零外部依赖 / 不引任何外部脚本与资源」——引 .png/.svg 文件
 *    就多一份要入库、要跟着部署走的二进制/文件依赖；
 * ② 这些图标要跟着主题色（--line 金 / --ink 米）走，图片改不了色；
 * ③ 线条粗细在深底上要「刚刚好」，图片做不到这个精度。
 *
 * 统一规格（改这里就全站跟着变，别在各处单独调）：
 *   viewBox 24×24 · stroke 1.5 · round linecap/linejoin · 无填充
 *   颜色走 currentColor，继承父元素 color
 *
 * ⚠️ 必须自带 CSS 引入（同 BindingDecor / SceneTransition 的教训）：
 *    漏 import 这行 → 图标照样渲染（SVG 靠属性），但没有尺寸约束，
 *    会撑破卡片布局。
 */
import './Icon.css'

/** 24×24 视图内的线条图形。path 用 stroke，不用 fill（除实心小点）。 */
const PATHS = {
  /* ---- 账簿面 ---- */
  // 账本：两本叠放的书脊
  ledger: (
    <>
      <rect x="3" y="4" width="13" height="16" rx="1.5" />
      <path d="M8 4v16" />
      <path d="M19 7v11.5a1.5 1.5 0 0 1-1.5 1.5H8" />
    </>
  ),
  // 算盘：记账的记
  abacus: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 9h18M3 15h18" />
      <circle cx="8" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  // 铜钱：收入支出
  coin: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9.5 10h5M9.5 14h5" />
    </>
  ),
  // 日历：本月
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="1.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  // 钱袋：存款
  pouch: (
    <>
      <path d="M12 3v3" />
      <path d="M9 6h6l1.5 2.5a7 7 0 1 1-12 0L6 8.5 9 6Z" />
      <path d="M10 13h4" />
    </>
  ),
  // 筷子：餐饮分类
  chopsticks: (
    <>
      <path d="M7 3v9a2 2 0 0 0 4 0V3" />
      <path d="M9 3v9" />
      <path d="M15 3c-1.5 2-2 5-2 8v10" />
    </>
  ),

  /* ---- 简历面 ---- */
  // 文件：记一条
  file: (
    <>
      <path d="M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5L14 3Z" />
      <path d="M14 3v4.5h4.5" />
      <path d="M8.5 12h7M8.5 16h5" />
    </>
  ),
  // 简历纸：简历预览
  resume: (
    <>
      <rect x="5" y="2.5" width="14" height="19" rx="1.5" />
      <circle cx="12" cy="9" r="2.5" />
      <path d="M8.5 17c.6-1.8 1.9-2.8 3.5-2.8s2.9 1 3.5 2.8" />
    </>
  ),
  // 靶心：岗位匹配
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
    </>
  ),
  // 罗盘 / 雷达：六维打分
  radar: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.5" />
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />
    </>
  ),
  // 奖章 / 印章：公章
  seal: (
    <>
      <circle cx="12" cy="9" r="5.5" />
      <path d="m9 14-1 7 4-2.5 4 2.5-1-7" />
      <path d="M10 9h4M12 7v4" />
    </>
  ),
  // 信封：联系方式
  mail: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="1.5" />
      <path d="m3 6.5 9 6.5 9-6.5" />
    </>
  ),
  // 里程碑：目标职位
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4.5h11l-2 3.5 2 3.5H6" />
    </>
  ),
  // 井号 / 栏目：章节标题装饰
  section: (
    <>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </>
  ),
  // 放大镜：预览 / 查看
  look: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </>
  ),
  // 齿条 / 排序：列表
  list: (
    <>
      <path d="M9 6h12M9 12h12M9 18h12" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  // 波形：编辑
  edit: (
    <>
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m14.5 6.5 3 3" />
    </>
  ),
}

/** 图标名白名单（防止传错名字渲染出空白）*/
export const ICON_NAMES = Object.keys(PATHS)

/**
 * 线条图标
 * @param {string} name  ICON_NAMES 之一
 * @param {number} size  像素边长，默认 24
 * @param {string} label 无障碍标签。**只传有意义的图标**；
 *        纯装饰图标传 null（会自动 aria-hidden，避免读屏念出"图片"）。
 */
export default function Icon({ name, size = 24, label = null, className = '' }) {
  const shape = PATHS[name]
  if (!shape) return null
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
    >
      {shape}
    </svg>
  )
}
