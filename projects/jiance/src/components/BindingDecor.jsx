/**
 * 简册 · 装订册三件套（Day 16 v1.12 补全）
 *
 * 两面各自一套装饰（账簿面 = 朱 + 装订孔 + 朱蓝印章；简历面 = 灰细线 + 描边印章）。
 * `@media print` 必须全部撕干净 —— 简历纸 / 导出 PDF 上不该出现屏幕装订线 / 印章 / 暗纹。
 *
 * 用法：
 *   import BindingDecor from '../components/BindingDecor.jsx'
 *   ...
 *   <section className="placeholder">
 *     <BindingDecor face="ledger" />   // 或「resume」-
 *     ...
 *   </section>
 *
 * ⚠️ 必须自带 CSS 引入：漏了这行，装订线 / 暗纹 / 印章 / 折痕全都不会加载 ——
 *    页面上只会多出几个无样式的 div，外加一个孤零零的「账」/「履」字浮在左上角。
 */
import './BindingDecor.css'

export default function BindingDecor({ face = 'ledger' }) {
  const isLedger = face === 'ledger'
  return (
    <div
      className={`page-deco ${isLedger ? 'is-ledger' : 'is-resume'}`}
      aria-hidden="true"
    >
      <div className="deco-binding"></div>
      <span className="deco-seal">{isLedger ? '账' : '履'}</span>
      <div className="deco-fold"></div>
    </div>
  )
}