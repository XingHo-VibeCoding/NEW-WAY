/**
 * 简册 · 给模型的提示词（Day 23 新增）
 * ------------------------------------------------------------
 * 干什么：把「简历面」两处要问 AI 的内容，拼成一段**可以直接粘贴**的提示词。
 *        拼好之后交给 `AskModel` 组件 —— 它只做两件事：
 *        **复制到剪贴板** + **新标签打开官网**。简册不调模型、不碰密钥。
 *
 * 🔴🔴 个人信息红线（AGENTS.md 附三第 4 条 · 最高优先级）：
 *   本文件里两个函数**都不接收、也不读 `profile.contact`**（手机号 / 邮箱）。
 *   这不是「记得别传」，是**接口上就传不进来** —— 调用方拿不到这个字段可传。
 *   ⚠️ 改这两个函数时**必须重新确认这条**（原话在 AGENTS.md 附三第 4 条）。
 *   理由：拼出来的提示词会被**复制到剪贴板**，进而可能被粘到模型官网 ——
 *   一旦 contact 混进去，就是用户自己把手机号交给了第三方，而他还不知道。
 *
 * ⚠️ 另一个必须守住的口径：**不许编造**。
 *   提示词里写死了「信息不足就说未提供」。因为用户会把结果当简历直接用，
 *   模型顺手编个数字（「提升 300%」）比不回答更坏 —— 那是给面试埋雷。
 */

/**
 * 把一条经历排成给模型看的几行。
 *
 * 为什么不用 JSON：模型读中文散文比读 JSON 更稳，而且这段文字用户自己也会看到
 * （AskModel 里有「看看将要复制的内容」），人能读懂比机器友好更要紧。
 *
 * @param {object} e     一条经历（startDate / endDate / org / role / content / result）
 * @param {number} index 序号（从 0 开始）
 * @returns {string}
 */
function entryBlock(e, index) {
  const period = (e.startDate || '未提供') + ' ~ ' + (e.endDate || '至今')
  const lines = [
    String(index + 1) + '. ' + period + (e.org ? '｜' + e.org : '') + (e.role ? '｜' + e.role : ''),
    '   做了什么：' + (e.content || '未提供'),
  ]
  // result 为空时**不写这一行** —— 写了「成果：未提供」反而诱使模型去补一个
  if (e.result) {
    lines.push('   成果：' + e.result)
  }
  return lines.join('\n')
}

/**
 * 把所有经历拼成一段。
 * @param {Array} entries
 * @returns {string}
 */
function allEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return '（我还没有填任何经历）'
  }
  return entries.map(entryBlock).join('\n')
}

/** 提示词里统一的那句防编造要求（两处都用，措辞一致） */
const NO_FABRICATION = '只用我给的材料判断 —— **信息不足就写「未提供」，绝对不要编造**任何数字、公司、时间或技术栈。'

/**
 * 简历优化提示词（原名沿用旧版：`buildOptimizePrompt`）。
 *
 * @param {object} p
 * @param {Array}  p.entries    经历数组
 * @param {string} [p.targetRole] 目标职位（用户自己填的，选填）
 * @returns {string} 可以直接粘贴的提示词
 */
export function buildOptimizePrompt({ entries, targetRole }) {
  const role = (targetRole || '').trim()
  return [
    '你是一位资深的中文简历顾问。下面是我的工作经历，请帮我改写成更专业的简历表述。',
    '',
    '要求：',
    '1. 每条经历写成「做了什么 + 做成了什么」，尽量带上我**原文里已有的**数字；',
    '2. 用招聘官习惯的说法，不要空话套话（例如「认真负责」「沟通能力强」）；',
    '3. ' + NO_FABRICATION,
    '4. 中文输出，每条经历给一段改写后的文字即可，不要额外解释。',
    '',
    '我的目标职位：' + (role || '未提供'),
    '',
    '我的经历：',
    allEntries(entries),
  ].join('\n')
}

/**
 * 岗位匹配提示词（原名沿用旧版：`buildMatchPrompt`）。
 *
 * ⚠️ 六维标准**从调用方传进来**（`Match.jsx` 的 `DIMENSIONS`），本文件不写第二份 ——
 *    写死了就有两份口径，改一处忘一处，页面显示的标准和提示词里的标准会对不上。
 *
 * @param {object} p
 * @param {object} p.form        岗位表单（jd / title / company / city / salary / edu）
 * @param {Array}  p.entries     经历数组
 * @param {Array}  p.dimensions  六维（label + weight）
 * @returns {string} 可以直接粘贴的提示词
 */
export function buildMatchPrompt({ form, entries, dimensions }) {
  const dims = Array.isArray(dimensions) ? dimensions : []
  const f = form || {}

  const standard = dims.map((d) => '- ' + d.label + ' ' + d.weight + '%').join('\n')
  const scoreLine = dims.map((d) => d.label + ' XX / ' + d.weight).join('，')

  const jobInfo = [
    '岗位名称：' + (f.title || '').trim(),
    '公司：' + (f.company || '').trim(),
    '城市：' + (f.city || '').trim(),
    '薪资期望：' + (f.salary || '').trim(),
    '学历要求：' + (f.edu || '').trim(),
  ]

  return [
    '你是一位资深的中文招聘顾问。请按下面这套**固定的六维标准**，评估我与这个岗位的匹配度，并写一段开场白。',
    '',
    '【评分标准】（总分 100，各维度权重固定，不许自己改权重或另加维度）',
    standard,
    '',
    '【输出格式】请严格照这个格式，方便我逐项对照：',
    '综合匹配度：XX 分',
    '逐维度：' + scoreLine,
    '最强的一项：XX，理由一句话',
    '最弱的一项：XX，建议我补什么',
    '推荐开场白：一段可以直接发给 HR 的话',
    '',
    '规则：' + NO_FABRICATION,
    '',
    '【岗位 JD】（我自己从招聘网站复制过来的原文）',
    (f.jd || '').trim() || '（未填）',
    '',
    '【岗位信息】',
    jobInfo.join('\n'),
    '',
    '【我的经历】',
    allEntries(entries),
  ].join('\n')
}
