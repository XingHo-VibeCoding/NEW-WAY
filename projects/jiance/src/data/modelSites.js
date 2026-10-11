/**
 * 简册 · 可选的模型官网（Day 23 新增 · 归属：AI 改版后的「拿去问 AI」）
 * ------------------------------------------------------------
 * 干什么：给用户一份「去哪问」的清单。用户选一家 → 简册把提示词复制到剪贴板
 *         → 新标签打开那家官网 → 用户用自己的账号提问。
 *
 * 🔴 为什么简册要自己存这份表：
 *   简册是**要部署出去的产品**，不能依赖开发机上的技能目录（那不进仓库）。
 *   所以这里内联一份副本。
 *
 * ⚠️ **单一数据源在 `model-router` 技能**：
 *   `~/.workbuddy/skills/model-router/references/sites.json`
 *   **改一处必须改两处**，否则两边会漂移（改完记得跑那个技能的 privacy_check.py）。
 *   ⚠️ 两边**必须一致的字段**：`id` / `name` / `chatUrl`。
 *      `vendor` / `badge` / `color` / `summary` 简册自己要用，属于展示层副本；
 *      `aliases`（别名）与 `homeUrl` 简册用不到，**刻意不抄** —— 少一个字段就少一处漂移。
 *
 * 🔴 零密钥：这张表里**全是公开的官网网址**，不含任何密钥、令牌、provider key。
 * 🔴 零外发：简册**不向这些站点发任何请求**。它们只是「点一下跳过去」的目标地址。
 *
 * ⚠️ 换域名的后果：文心一言的旧域名 `yiyan.baidu.com` 已 301 跳到 `wenxin.baidu.com`，
 *    本表统一用后者。以后若再迁移，改这里 + 改技能里那份，并重跑自检。
 */

/** 允许跳转的 8 家（顺序 = 页面上展示的顺序） */
export const MODEL_SITES = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    vendor: '深度求索',
    badge: 'D',
    color: '#4D6BFE',
    chatUrl: 'https://chat.deepseek.com/',
    summary: '深度思考 + 联网搜索，代码与理科推理强',
  },
  {
    id: 'kimi',
    name: 'Kimi',
    vendor: '月之暗面',
    badge: 'K',
    color: '#111827',
    chatUrl: 'https://www.kimi.com/',
    summary: '超长上下文，长文档 / 深度研究 / 建站',
  },
  {
    id: 'qwen',
    name: '千问（通义千问）',
    vendor: '阿里巴巴',
    badge: '千',
    color: '#615CED',
    chatUrl: 'https://www.qianwen.com/',
    summary: '办公全能，文档理解 / PPT 创作 / 音视频速读',
  },
  {
    id: 'doubao',
    name: '豆包',
    vendor: '字节跳动',
    badge: '豆',
    color: '#1590FF',
    chatUrl: 'https://www.doubao.com/chat/',
    summary: '国民级助手，语音交互、拍题答疑、多模态',
  },
  {
    id: 'chatglm',
    name: '智谱清言',
    vendor: '智谱',
    badge: '智',
    color: '#2A5CFF',
    chatUrl: 'https://chatglm.cn/',
    summary: '数据分析与智能体，读论文、生成图表',
  },
  {
    id: 'yiyan',
    name: '文心一言',
    vendor: '百度',
    badge: '文',
    color: '#2B6DE5',
    chatUrl: 'https://wenxin.baidu.com/',
    summary: '中文语义理解与创意写作',
  },
  {
    id: 'yuanbao',
    name: '腾讯元宝',
    vendor: '腾讯',
    badge: '元',
    color: '#2E7BE5',
    chatUrl: 'https://yuanbao.tencent.com/',
    summary: '联网搜索公众号 / 视频号等腾讯生态信源',
  },
  {
    id: 'xinghuo',
    name: '讯飞星火',
    vendor: '科大讯飞',
    badge: '星',
    color: '#0E86E8',
    chatUrl: 'https://xinghuo.xfyun.cn/',
    summary: '语音转写、多写作场景模板',
  },
]

/**
 * 取出一个地址的 host（域名）。
 * @param {string} url
 * @returns {string} 取不出来就返回空串
 */
function hostOf(url) {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/**
 * 允许跳转的域名白名单 —— **从上面那张表推出来**，不手写第二份。
 *
 * 为什么不手写：手写就有两份名单，改一份忘一份 = 白名单形同虚设。
 * 从表里推出来，这两者永远一致。
 */
export const ALLOWED_HOSTS = MODEL_SITES.map((s) => hostOf(s.chatUrl)).filter((h) => h !== '')

/**
 * 跳转前的最后一道闸：这个地址到底允不允许跳？
 *
 * ⚠️ 为什么要有这个函数（这不是多余的防御）：
 *    组件里渲染的是 `<a href>`。将来若有人往 MODEL_SITES 里塞了一个非官网地址，
 *    用户点下去就会被带到别处 —— 那可能是钓鱼站。
 *    这道闸让「塞错地址」在**渲染前**就被拦下，而不是等用户点过去才发现。
 *
 * 🔴 判据只有两条（都过了才算通过）：
 *    ① 协议**必须**是 `https:` —— 不许 http（明文、可被中间人改）
 *    ② host **必须**在白名单里（精确匹配，不做「后缀包含」——
 *       `evil-deepseek.com` 包含 `deepseek.com`，用包含判断就等于放它过去）
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isAllowedSiteUrl(url) {
  if (typeof url !== 'string' || url === '') return false
  let u = null
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  return ALLOWED_HOSTS.indexOf(u.host) !== -1
}
