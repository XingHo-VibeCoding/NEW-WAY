#!/usr/bin/env node
/**
 * 简册 · 发布前自检（verify-project Skill 的执行体）
 * ============================================================
 * 干什么：照 projects/verify-project/SKILL.md 里那张检查单，逐条去查，
 *         每条给出 PASS / FAIL / SKIP + 一句「证据」。
 *
 * 怎么跑：
 *   cd D:/梦空间
 *   node projects/verify-project/scripts/verify.mjs [--explain] [--no-net]
 *        [--with-write] [--fast] [--groups=A,C]
 *
 * 退出码：有 FAIL → 1；全绿（含 SKIP）→ 0
 *
 * ⚠️ 三条设计纪律（踩过才知道，别顺手改掉）：
 *   1. **特征串拆开拼**（见下面 SIG 那段）—— 本文件自己会被 A2「工作区扫密钥」扫到，
 *      如果原样写着特征串，就会**永远命中自己**，变成永远报警的假检查。
 *      Day 23 的结论：一个永远会报警的检查，等于没有检查。
 *   2. **SKIP ≠ PASS** —— 没查成就是没查成，报告里必须分开数，
 *      不能让「断网导致 7 项没跑」看起来像「7 项通过」。
 *   3. **只扫「会被提交的文件」**（git ls-files -co --exclude-standard）——
 *      这样 node_modules / dist / Temp / .workbuddy 天然被排除，
 *      不用维护一份排除目录清单（清单会过期，git 的忽略规则不会）。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* ============================================================
   第 0 段 · 参数与环境
   ============================================================ */

const argv = process.argv.slice(2)
const FLAGS = {
  explain: argv.includes('--explain'),
  noNet: argv.includes('--no-net'),
  withWrite: argv.includes('--with-write'),
  fast: argv.includes('--fast'),
  groups: (() => {
    const a = argv.find((s) => s.startsWith('--groups='))
    return a ? a.slice('--groups='.length).split(',').map((s) => s.trim().toUpperCase()) : null
  })(),
}

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR
const c = (code, s) => (COLOR ? `\u001b[${code}m${s}\u001b[0m` : s)
const GREEN = (s) => c('32', s)
const RED = (s) => c('31;1', s)
const YELLOW = (s) => c('33', s)
const DIM = (s) => c('2', s)
const BOLD = (s) => c('1', s)

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))

/** 跑一条命令，永远不抛异常（非零退出码也接住） */
function run(cmd, args, opts = {}) {
  try {
    const out = execFileSync(cmd, args, {
      cwd: opts.cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out: out || '', err: '' }
  } catch (e) {
    return {
      code: typeof e.status === 'number' ? e.status : 1,
      out: (e.stdout || '').toString(),
      err: (e.stderr || '').toString(),
    }
  }
}

const REPO = (() => {
  const r = run('git', ['rev-parse', '--show-toplevel'], { cwd: SCRIPT_DIR })
  if (r.code !== 0) {
    console.error('找不到 git 仓库根目录，请在 D:/梦空间 里跑这个脚本。')
    process.exit(2)
  }
  return r.out.trim().replace(/\\/g, '/')
})()

const JIANCE = `${REPO}/projects/jiance`
const SRC = `${JIANCE}/src`
const DIST = `${JIANCE}/dist`
const FUNCS = `${JIANCE}/cloudbase/functions`

/* ============================================================
   第 1 段 · 密钥特征串（⚠️ 必须拆开拼，理由见文件头纪律 1）
   ============================================================ */

const SIG = [
  'ey' + 'J[A-Za-z0-9_-]{20,}', // JWT 形状的长串（云开发 API Key 的长相）
  'AK' + 'ID[A-Za-z0-9]{16,}', // 云厂商 SecretId
  '-' + '----BEGIN [A-Z ]*PRIVATE KEY', // PEM 私钥头（4+5 个短横线拼出来）
  'sk' + '-[A-Za-z0-9]{20,}', // sk- 开头的长串
  'gh' + 'p_[A-Za-z0-9]{20,}', // GitHub 令牌
].join('|')

/* ⚠️ 曾经在这里挂过一份「讲密钥长相的文档」排除清单（Day 25 第一版）。
   第 1 次实跑证明它**是多余的**：那份文档里写的是**正则本身**
   （`eyJ[A-Za-z0-9_-]{20,}`），而正则去匹配「正则的原文」是匹配不上的
   （`eyJ` 后面跟的是 `[`，不是字母数字）。所以它从来没被命中过。
   已按「不要留没用的机关」删掉 —— 少一份要维护的清单，也少一个
   「被拿来把真命中关掉」的口子。若将来真出现假命中，再加回来并写明理由。 */

/* ============================================================
   第 2 段 · 文件与文本工具
   ============================================================ */

/** 会被提交的文件：已跟踪 + 未忽略的新文件（不含 node_modules / dist / Temp / .workbuddy） */
function listRepoFiles() {
  const r = run('git', ['ls-files', '-co', '--exclude-standard'], { cwd: REPO })
  if (r.code !== 0) return []
  return r.out.split('\n').map((s) => s.trim()).filter(Boolean)
}

function listGitFiles() {
  const r = run('git', ['ls-files'], { cwd: REPO })
  return r.out.split('\n').map((s) => s.trim()).filter(Boolean)
}

/** 在一批文件里逐行找正则。返回 [{file, line, text}] */
function scan(files, re, { maxHits = 400 } = {}) {
  const hits = []
  for (const f of files) {
    const abs = path.join(REPO, f)
    let st
    try {
      st = statSync(abs)
    } catch {
      continue
    }
    if (!st.isFile() || st.size > 3 * 1024 * 1024) continue
    let txt
    try {
      txt = readFileSync(abs, 'utf8')
    } catch {
      continue
    }
    const lines = txt.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) hits.push({ file: f, line: i + 1, text: lines[i].trim().slice(0, 110) })
      if (hits.length >= maxHits) return hits
    }
  }
  return hits
}

/** 注释行：// * /* <!-- 开头（这些行是在「讲纪律」，不是真出现东西） */
function isComment(text) {
  const t = text.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--')
}

function checkIgnore(rel) {
  const r = run('git', ['check-ignore', '-v', rel], { cwd: REPO })
  return r.code === 0 ? r.out.trim() : ''
}

function readIfExists(p) {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

/** 读 .env 文件成对象 */
function readEnvFile(name) {
  const txt = readIfExists(`${JIANCE}/${name}`)
  if (txt === null) return null
  const out = {}
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

/** 递归找某目录下最新修改时间 */
function newestMtime(dir, exts) {
  let newest = 0
  const walk = (d) => {
    let ents
    try {
      ents = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of ents) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (exts.some((x) => e.name.endsWith(x))) {
        try {
          const t = statSync(p).mtimeMs
          if (t > newest) newest = t
        } catch {
          /* ignore */
        }
      }
    }
  }
  walk(dir)
  return newest
}

function listDist(ext) {
  try {
    return readdirSync(DIST).filter((f) => f.endsWith(ext))
  } catch {
    return []
  }
}

/* ============================================================
   第 3 段 · 联网（带超时的 fetch）
   ============================================================ */

const ENV_PROD = readEnvFile('.env.production')
const ENV_EX = readEnvFile('.env.example')

const GATEWAY = ((ENV_PROD && ENV_PROD.VITE_API_BASE) || (ENV_EX && ENV_EX.VITE_API_BASE) || '')
  .replace(/\/+$/, '')

/** 静态托管域名：就是「页面自己的地址」。可用环境变量覆盖 */
const STATIC_HOST =
  process.env.JIANCE_STATIC_HOST || 'https://maybe666-d6g1z4erj391b54f5-1419623881.tcloudbaseapp.com'

const GATEWAY_HOST = (() => {
  try {
    return new URL(GATEWAY).host
  } catch {
    return ''
  }
})()

async function httpGet(url, headers = {}, opts = {}) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), opts.timeoutMs || 15000)
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers,
      body: opts.body,
      redirect: 'follow',
      signal: ac.signal,
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* 不是 JSON 就留 null */
    }
    return { status: res.status, headers: res.headers, text, json }
  } finally {
    clearTimeout(t)
  }
}

/* ============================================================
   第 4 段 · 结果小工具
   ============================================================ */

const ok = (evidence) => ({ status: 'PASS', evidence })
const bad = (evidence) => ({ status: 'FAIL', evidence })
const skip = (evidence) => ({ status: 'SKIP', evidence })
const hasCJK = (s) => /[\u4e00-\u9fa5]/.test(s || '')

/* ============================================================
   第 5 段 · 检查项
   ============================================================ */

const checks = []

function add(group, id, title, how, expect, fn) {
  checks.push({ group, id, title, how, expect, run: fn })
}

/* ---------- 组 A · 密钥与入库物 ---------- */

add('A', 'A1', '全历史无密钥特征串', '对 rev-list --all 的每个提交跑 git grep', '命中 0', () => {
  const revs = run('git', ['rev-list', '--all'], { cwd: REPO }).out.trim().split('\n').filter(Boolean)
  if (revs.length === 0) return skip('仓库里没有提交')
  const use = FLAGS.fast ? revs.slice(0, 1) : revs
  const all = []
  for (let i = 0; i < use.length; i += 150) {
    const chunk = use.slice(i, i + 150)
    const r = run('git', ['grep', '-I', '-n', '-E', '-e', SIG, ...chunk], { cwd: REPO })
    if (r.code === 0) {
      for (const line of r.out.split('\n')) {
        if (line.trim()) all.push(line)
      }
    } else if (r.code !== 1) {
      return skip(`git grep 出错（退出码 ${r.code}）：${r.err.trim().slice(0, 80)}`)
    }
  }
  const scope = FLAGS.fast ? `只扫了最新 1 个提交（--fast）` : `${revs.length} 个提交全扫`
  return all.length === 0
    ? ok(`${scope}，命中 0`)
    : bad(`${scope}，命中 ${all.length} 处：\n      ${all.slice(0, 5).join('\n      ')}`)
})

add('A', 'A2', '会被提交的文件里无密钥特征串', 'git ls-files -co --exclude-standard 取文件清单，逐行匹配', '命中 0', () => {
  const files = listRepoFiles()
  const hits = scan(files, new RegExp(SIG))
  return hits.length === 0
    ? ok(`扫了 ${files.length} 个会被提交的文件，命中 0`)
    : bad(
        `命中 ${hits.length} 处：\n      ${hits
          .slice(0, 5)
          .map((h) => `${h.file}:${h.line}  ${h.text}`)
          .join('\n      ')}`
      )
})

add('A', 'A3', '密钥/打包物/证书没混进仓库', 'git ls-files 过滤文件名关键词', '只允许 .env.example', () => {
  const files = listGitFiles()
  const re = /\.env|\.zip$|\.pem$|\.key$|\.p12$|secret|credential|apikey/i
  const bads = files.filter((f) => re.test(f) && !f.endsWith('.env.example'))
  return bads.length === 0
    ? ok(`已跟踪 ${files.length} 个文件，可疑 0 个（.env.example 是唯一例外）`)
    : bad(`命中 ${bads.length} 个：${bads.slice(0, 6).join(' / ')}`)
})

add('A', 'A4', '前端源码里的密钥词只出现在注释里', '扫 src/ 的 TCB_ / APIKEY / SECRET / TOKEN / CLOUDBASE', '非注释命中 0', () => {
  const files = listRepoFiles().filter((f) => f.startsWith('projects/jiance/src/'))
  const hits = scan(files, /TCB_|APIKEY|SECRET|TOKEN|CLOUDBASE/)
  const nonComment = hits.filter((h) => !isComment(h.text))
  return nonComment.length === 0
    ? ok(`扫了 ${files.length} 个前端源文件；命中 ${hits.length} 处，全是纪律注释，非注释命中 0`)
    : bad(
        `非注释命中 ${nonComment.length} 处：\n      ${nonComment
          .slice(0, 5)
          .map((h) => `${h.file}:${h.line}  ${h.text}`)
          .join('\n      ')}`
      )
})

add('A', 'A5', '.env.production 被 Git 拦住', 'git check-ignore -v projects/jiance/.env.production', '命中忽略规则', () => {
  const r = checkIgnore('projects/jiance/.env.production')
  return r ? ok(r) : bad('没有被任何忽略规则命中 —— 它可能会被提交上去！')
})

/* ---------- 组 B · 环境变量 ---------- */

add('B', 'B0', 'dist/ 不比源码旧', '对比 dist/*.js 与 src/ 下最新文件的时间戳', 'dist 不旧于源码', () => {
  const js = listDist('.js')
  if (js.length === 0) return bad('dist 里没有 .js 产物 —— 还没构建过？跑 npm run build')
  let distNewest = 0
  for (const f of listDist('')) {
    try {
      const t = statSync(path.join(DIST, f)).mtimeMs
      if (t > distNewest) distNewest = t
    } catch {
      /* ignore */
    }
  }
  const srcNewest = newestMtime(SRC, ['.js', '.jsx', '.css'])
  if (srcNewest === 0) return skip('读不到 src 的时间戳')
  return distNewest >= srcNewest
    ? ok(`dist 最新 ${new Date(distNewest).toLocaleString()}；源码最新 ${new Date(srcNewest).toLocaleString()}`)
    : bad(
        `dist 比源码旧 —— 改了代码没重新构建。` +
          `dist ${new Date(distNewest).toLocaleString()} / src ${new Date(srcNewest).toLocaleString()}`
      )
})

add('B', 'B1', '接口地址真注入进产物', '在 dist/index-*.js 里找网关域名', '命中 ≥1', () => {
  if (!GATEWAY_HOST) return skip('拿不到网关域名（.env.production / .env.example 都没读到）')
  const js = listDist('.js')
  if (js.length === 0) return bad('dist 里没有 .js 产物')
  let n = 0
  for (const f of js) {
    const t = readIfExists(path.join(DIST, f)) || ''
    n += t.split(GATEWAY_HOST).length - 1
  }
  return n >= 1
    ? ok(`${GATEWAY_HOST} 在产物里出现 ${n} 次`)
    : bad(`产物里找不到 ${GATEWAY_HOST} —— 环境变量没生效（重新 npm run build）`)
})

add('B', 'B2', '产物里没有 undefined/api', '在 dist/index-*.js 里找 "undefined/api"', '命中 0', () => {
  const js = listDist('.js')
  if (js.length === 0) return bad('dist 里没有 .js 产物')
  let n = 0
  for (const f of js) {
    const t = readIfExists(path.join(DIST, f)) || ''
    n += t.split('undefined/api').length - 1
  }
  return n === 0
    ? ok('命中 0（地址不会拼成 undefined/api/…）')
    : bad(`命中 ${n} 次 —— VITE_API_BASE 没注入，页面会去请求 address/undefined/api/…`)
})

add('B', 'B3', '环境变量名都带 VITE_ 前缀', '扫 src/ 里 import.meta.env.X 的 X', '全部 VITE_ 开头', () => {
  const files = listRepoFiles().filter((f) => f.startsWith('projects/jiance/src/'))
  const hits = scan(files, /import\.meta\.env\.[A-Za-z0-9_]+/)
  if (hits.length === 0) return skip('源码里没有 import.meta.env.* 的用法')
  const names = new Set()
  const badNames = new Set()
  // ⚠️ 只看**非注释行**：Day 25 第 1 次跑时这里误报过一次 ——
  //    client.js 的注释里写着「把 `import.meta.env.VITE_*` 替换成真实值」，
  //    正则从注释里抠出了一个假的变量名 `VITE_`。注释是在讲纪律，不是在用变量。
  for (const f of new Set(hits.map((h) => h.file))) {
    const txt = readIfExists(path.join(REPO, f)) || ''
    for (const line of txt.split(/\r?\n/)) {
      if (isComment(line)) continue
      for (const m of line.matchAll(/import\.meta\.env\.([A-Za-z0-9_]+)/g)) {
        names.add(m[1])
        if (!m[1].startsWith('VITE_')) badNames.add(m[1])
      }
    }
  }
  return badNames.size === 0
    ? ok(`${names.size} 个变量名（${[...names].join(' / ')}）都带 VITE_ 前缀`)
    : bad(`这些没带 VITE_ 前缀（Vite 不会把它注入产物）：${[...badNames].join(' / ')}`)
})

add('B', 'B4', '.env.example 与 .env.production 变量名一致', '两边变量名集合比对', '一致', () => {
  if (!ENV_PROD) return skip('本地没有 .env.production（clone 下来还没复制）')
  if (!ENV_EX) return skip('本地没有 .env.example')
  const a = new Set(Object.keys(ENV_PROD))
  const b = new Set(Object.keys(ENV_EX))
  const onlyProd = [...a].filter((k) => !b.has(k))
  const onlyEx = [...b].filter((k) => !a.has(k))
  return onlyProd.length === 0 && onlyEx.length === 0
    ? ok(`两边都是 ${a.size} 个变量：${[...a].join(' / ')}`)
    : bad(
        `对不上 —— 只在 .env.production：${onlyProd.join(',') || '无'}；只在 .env.example：${onlyEx.join(',') || '无'}`
      )
})

add('B', 'B5', '取环境变量时写了兜底（||）', '在 client.js 找 import.meta.env.VITE_API_BASE ||', '存在', () => {
  const t = readIfExists(`${SRC}/api/client.js`)
  if (t === null) return skip('找不到 src/api/client.js')
  return /import\.meta\.env\.VITE_API_BASE\s*\|\|/.test(t)
    ? ok('client.js 用的是 import.meta.env.VITE_API_BASE || \'\' —— 变量丢了也不会变成 undefined')
    : bad('没写 || 兜底 —— 变量没配时会拿到 undefined，拼出 undefined/api/…（极难查）')
})

/* ---------- 组 C · 忽略规则 ---------- */

const IGNORE_CASES = [
  ['C1', '.env.production 被忽略', 'projects/jiance/.env.production', true, '根 .gitignore 的 .env.*'],
  ['C2', '云函数打包物被忽略', 'projects/jiance/cloudbase/functions/expenses/expenses.zip', true, '*.zip'],
  ['C3', 'node_modules 被忽略', 'projects/jiance/node_modules', true, 'node_modules/'],
  [
    'C4',
    '⭐ 源码没被 ignore 误伤',
    'projects/jiance/src/data/modelSites.js',
    false,
    'Day 23 地雷：data/ 曾把正经源码静默吞掉',
  ],
  ['C5', 'Temp/ 被忽略', 'Temp/probe.js', true, '测试脚本不进仓库'],
]
for (const [id, title, target, shouldIgnore, note] of IGNORE_CASES) {
  add('C', id, title, `git check-ignore -v ${target}`, shouldIgnore ? '命中忽略规则' : '不命中（文件必须能被跟踪）', () => {
    const r = checkIgnore(target)
    if (shouldIgnore) {
      return r ? ok(`${r}　〔${note}〕`) : bad(`没被忽略！${target} 可能会被提交上去　〔${note}〕`)
    }
    return r
      ? bad(`**被误伤了**：${r}　→ 这个源码文件永远 git add 不上，队友那边直接编译不过　〔${note}〕`)
      : ok(`不命中任何忽略规则（能正常跟踪）　〔${note}〕`)
  })
}

/* ---------- 组 D · 跨域 ---------- */

add('D', 'D1', '自己的来源能拿到跨域通行证', `带 Origin: ${STATIC_HOST} 请求网关`, '回 ACAO 且不是 *', async () => {
  if (FLAGS.noNet) return skip('--no-net')
  if (!GATEWAY) return skip('拿不到网关地址')
  try {
    const r = await httpGet(`${GATEWAY}/api/health`, { Origin: STATIC_HOST })
    const acao = r.headers.get('access-control-allow-origin')
    if (!acao) return bad(`HTTP ${r.status} 但响应里没有 access-control-allow-origin —— 平台不在放行这个来源`)
    if (acao === '*') return bad('回的是 *（通配）—— 那是敞开大门，不该出现')
    return ok(`ACAO = ${acao}（具体域名，不是 *）`)
  } catch (e) {
    return skip(`连不上网关：${e.name === 'AbortError' ? '超时' : e.message}`)
  }
})

add('D', 'D2', '不带 Origin 时不该有该头', '直接请求，不看 Origin 头', '完全没有 ACAO', async () => {
  if (FLAGS.noNet) return skip('--no-net')
  if (!GATEWAY) return skip('拿不到网关地址')
  try {
    const r = await httpGet(`${GATEWAY}/api/health`)
    const acao = r.headers.get('access-control-allow-origin')
    return acao
      ? bad(`不带 Origin 却回了 ACAO = ${acao} —— 说明是「函数里自己写 CORS」，不是平台在管`)
      : ok(`HTTP ${r.status}，没有 ACAO（符合平台层行为）`)
  } catch (e) {
    return skip(`连不上网关：${e.name === 'AbortError' ? '超时' : e.message}`)
  }
})

add('D', 'D3', '陌生来源不放行', '带 Origin: https://evil.example.com', '不回 ACAO', async () => {
  if (FLAGS.noNet) return skip('--no-net')
  if (!GATEWAY) return skip('拿不到网关地址')
  try {
    const r = await httpGet(`${GATEWAY}/api/health`, { Origin: 'https://evil.example.com' })
    const acao = r.headers.get('access-control-allow-origin')
    return acao ? bad(`陌生来源却回了 ACAO = ${acao} —— 白名单没生效`) : ok(`HTTP ${r.status}，不放行（无 ACAO）`)
  } catch (e) {
    return skip(`连不上网关：${e.name === 'AbortError' ? '超时' : e.message}`)
  }
})

add('D', 'D4', '云函数里零 CORS 代码', '在 cloudbase/functions 找 Access-Control-Allow-Origin', '非注释命中 0', () => {
  const files = listRepoFiles().filter((f) => f.startsWith('projects/jiance/cloudbase/functions/'))
  /* ⚠️ 口径与 A4 / G2 / G3 保持一致：**只看非注释行**。
     为什么（Day 25 自查发现的潜在误报）：本项目到处在讲「跨域别写在函数里」，
     将来只要有人写一句注释提到这个响应头名字，旧口径就会报红 ——
     而那是**在讲纪律**，不是真写了 CORS 代码。 */
  const hits = scan(files, /Access-Control-Allow-Origin/)
  const nonComment = hits.filter((h) => !isComment(h.text))
  return nonComment.length === 0
    ? ok(`扫了 ${files.length} 个云函数文件；非注释命中 0（注释里 ${hits.length} 处，是在讲纪律）`)
    : bad(
        `非注释命中 ${nonComment.length} 处 —— 函数级 CORS 和平台层开关同时开会让响应头重复，浏览器直接拒绝：\n      ${nonComment
          .slice(0, 4)
          .map((h) => `${h.file}:${h.line}  ${h.text.slice(0, 60)}`)
          .join('\n      ')}`
      )
})

add('D', 'D5', 'GET 不带 Content-Type（省一趟预检）', '查 client.js 是否「有 body 才带」', '判断与赋值同时存在', () => {
  const t = readIfExists(`${SRC}/api/client.js`)
  if (t === null) return skip('找不到 src/api/client.js')
  const hasCond = /if\s*\(\s*options\s*&&\s*options\.body\s*\)/.test(t)
  const hasSet = /headers\[['"]Content-Type['"]\]\s*=/.test(t)
  return hasCond && hasSet
    ? ok('是「有 body 才带 Content-Type」—— GET 读列表不会多跑一趟 OPTIONS')
    : bad(`判断语句 ${hasCond ? '有' : '没有'}、赋值语句 ${hasSet ? '有' : '没有'} —— 可能给 GET 也加了 Content-Type`)
})

/* ---------- 组 E · 接口契约（只读） ---------- */

add('E', 'E1', 'GET /api/health 正常', 'curl 网关 /api/health', '200 + ok:true + service 对', async () => {
  if (FLAGS.noNet) return skip('--no-net')
  if (!GATEWAY) return skip('拿不到网关地址')
  try {
    const r = await httpGet(`${GATEWAY}/api/health`)
    const j = r.json
    if (r.status !== 200) return bad(`HTTP ${r.status}，期望 200`)
    if (!j || j.ok !== true) return bad(`200 但 ok 不为 true：${r.text.slice(0, 80)}`)
    if (j.service !== 'Ledger and Career') return bad(`service 是「${j.service}」，期望「Ledger and Career」`)
    return ok(`200 {"ok":true,"service":"Ledger and Career"}`)
  } catch (e) {
    return skip(`连不上网关：${e.name === 'AbortError' ? '超时' : e.message}`)
  }
})

add('E', 'E2', 'GET /api/expenses 回数组', 'curl 网关 /api/expenses', '200 + 是数组', async () => {
  if (FLAGS.noNet) return skip('--no-net')
  if (!GATEWAY) return skip('拿不到网关地址')
  try {
    const r = await httpGet(`${GATEWAY}/api/expenses`)
    if (r.status !== 200) return bad(`HTTP ${r.status}，期望 200`)
    if (!r.json || !Array.isArray(r.json.data)) return bad(`返回体里 data 不是数组：${r.text.slice(0, 80)}`)
    return ok(`200，data 是数组，${r.json.data.length} 条`)
  } catch (e) {
    return skip(`连不上网关：${e.name === 'AbortError' ? '超时' : e.message}`)
  }
})

add('E', 'E3', 'GET /api/profile 回对象', 'curl 网关 /api/profile', '200 + 是对象 + 含 savings', async () => {
  if (FLAGS.noNet) return skip('--no-net')
  if (!GATEWAY) return skip('拿不到网关地址')
  try {
    const r = await httpGet(`${GATEWAY}/api/profile`)
    if (r.status !== 200) return bad(`HTTP ${r.status}，期望 200`)
    const d = r.json && r.json.data
    if (!d || typeof d !== 'object' || Array.isArray(d)) return bad(`data 不是对象：${r.text.slice(0, 80)}`)
    if (!('savings' in d)) return bad(`对象里没有 savings 字段：${Object.keys(d).join(',')}`)
    return ok(`200，字段：${Object.keys(d).join(' / ')}`)
  } catch (e) {
    return skip(`连不上网关：${e.name === 'AbortError' ? '超时' : e.message}`)
  }
})

add(
  'E',
  'E4',
  '⭐ 没实现的地址回中文 404（Day 23 回归点）',
  'curl 网关 /api/expenses/summary',
  '404 + 中文提示',
  async () => {
    if (FLAGS.noNet) return skip('--no-net')
    if (!GATEWAY) return skip('拿不到网关地址')
    try {
      const r = await httpGet(`${GATEWAY}/api/expenses/summary`)
      if (r.status === 200 && r.json && Array.isArray(r.json.data)) {
        return bad(
          `回的是 200 + 全量列表（${r.json.data.length} 条）—— 这正是 Day 21 抓到的老问题：` +
            `平台按**前缀匹配**路由，summary 落进了 expenses 的读分支`
        )
      }
      if (r.status !== 404) return bad(`HTTP ${r.status}，期望 404`)
      const msg = (r.json && r.json.error && r.json.error.message) || ''
      if (!hasCJK(msg)) return bad(`404 了，但提示不是中文：${r.text.slice(0, 100)}`)
      return ok(`404「${msg.slice(0, 46)}…」`)
    } catch (e) {
      return skip(`连不上网关：${e.name === 'AbortError' ? '超时' : e.message}`)
    }
  }
)

add('E', 'E5', 'PUT 被拒（405）', 'curl -X PUT 网关 /api/expenses', '405', async () => {
  if (FLAGS.noNet) return skip('--no-net')
  if (!GATEWAY) return skip('拿不到网关地址')
  try {
    const r = await httpGet(`${GATEWAY}/api/expenses`, {}, { method: 'PUT' })
    return r.status === 405 ? ok('405（方法不被支持）') : bad(`HTTP ${r.status}，期望 405`)
  } catch (e) {
    return skip(`连不上网关：${e.name === 'AbortError' ? '超时' : e.message}`)
  }
})

add('E', 'E6', '非法月份参数被拦（400）', 'curl 网关 /api/expenses?month=2026-13', '400 + field=month', async () => {
  if (FLAGS.noNet) return skip('--no-net')
  if (!GATEWAY) return skip('拿不到网关地址')
  try {
    const r = await httpGet(`${GATEWAY}/api/expenses?month=2026-13`)
    if (r.status !== 400) return bad(`HTTP ${r.status}，期望 400`)
    const f = r.json && r.json.error && r.json.error.field
    if (f !== 'month') return bad(`400 了，但 error.field 是「${f}」，期望「month」`)
    return ok(`400 + field=month：「${(r.json.error.message || '').slice(0, 40)}」`)
  } catch (e) {
    return skip(`连不上网关：${e.name === 'AbortError' ? '超时' : e.message}`)
  }
})

add('E', 'E7', '账目记录字段齐全（8 个）', '取列表第一条，对契约第 2 号的 8 个字段名', '8 个都在', async () => {
  if (FLAGS.noNet) return skip('--no-net')
  if (!GATEWAY) return skip('拿不到网关地址')
  try {
    const r = await httpGet(`${GATEWAY}/api/expenses`)
    const rows = r.json && r.json.data
    if (!Array.isArray(rows)) return bad('拿不到数组，没法验字段')
    if (rows.length === 0) return skip('库里一条账目都没有（seed 没跑？）')
    /* ⚠️ 这里用**契约的驼峰名**（createdAt / updatedAt），不是数据库列名
       （created_at / updated_at）。Day 25 第 1 次跑时我用错了列名 → 误报 FAIL。
       两者的关系：后端内部按数据库列名查（Day 18 出口校验），
       但**发出来的 JSON 是驼峰**（api-contract.md 第 382–395 行的样例）。
       「后端内部查什么列」和「接口发出来叫什么名字」是两件事，别混。 */
    const need = ['id', 'date', 'amount', 'type', 'category', 'note', 'createdAt', 'updatedAt']
    const miss = need.filter((k) => !(k in rows[0]))
    return miss.length === 0
      ? ok(`第一条 8 个字段齐全（${need.join('/')}）`)
      : bad(`缺字段：${miss.join(' / ')} —— 出口校验没拦住残缺对象`)
  } catch (e) {
    return skip(`连不上网关：${e.name === 'AbortError' ? '超时' : e.message}`)
  }
})

/* ---------- 组 F · 构建产物与静态托管 ---------- */

add('F', 'F1', '产物是平铺的（无 assets/ 子目录）', '看 dist 结构', '无 assets，有 index-*.js 与 index-*.css', () => {
  if (!existsSync(DIST)) return bad('dist 不存在 —— 还没构建')
  const hasAssets = existsSync(`${DIST}/assets`)
  const js = listDist('.js')
  const css = listDist('.css')
  if (hasAssets) {
    return bad(
      'dist 里有 assets/ 子目录 —— vite.config.js 的 build.assetsDir 失效了（Day 20 改成平铺后不该出现）'
    )
  }
  if (js.length === 0 || css.length === 0) {
    return bad(`平铺产物不齐：.js ${js.length} 个 / .css ${css.length} 个`)
  }
  return ok(`平铺正确：${js.join(', ')} + ${css.join(', ')}`)
})

add('F', 'F2', '⭐ index.html 引用的文件真实存在', '解析 dist/index.html 的 src/href 逐个查', '每个都能找到', () => {
  const html = readIfExists(`${DIST}/index.html`)
  if (html === null) return bad('dist/index.html 不存在 —— 白屏的头号原因就是它引用的东西丢了')
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !/^(https?:|data:|#)/.test(u))
  if (refs.length === 0) return bad('index.html 里没解析出任何本地引用（不正常）')
  const miss = refs.filter((u) => !existsSync(path.join(DIST, u.replace(/^\//, ''))))
  return miss.length === 0
    ? ok(`引用的 ${refs.join(' / ')} 都在 dist/ 里（${refs.length} 个）`)
    : bad(`这些引用的文件在 dist/ 里找不到 → 上传后必然白屏：${miss.join(' / ')}`)
})

add('F', 'F3', '引用路径是平铺写法（不带 /assets/）', '在 dist/index.html 里找 /assets/', '命中 0', () => {
  const html = readIfExists(`${DIST}/index.html`)
  if (html === null) return bad('dist/index.html 不存在')
  const n = html.split('/assets/').length - 1
  return n === 0 ? ok('没有 /assets/ 路径') : bad(`出现 ${n} 次 /assets/，与「平铺」口径不符（上传时容易放错位置）`)
})

add('F', 'F4', '线上跑的就是本地这份构建', '抓线上首页，比对 index-*.js 文件名', '文件名一致', async () => {
  if (FLAGS.noNet) return skip('--no-net')
  const local = listDist('.js').filter((f) => f.startsWith('index-'))
  if (local.length === 0) return bad('本地 dist 里没有 index-*.js')
  try {
    const r = await httpGet(`${STATIC_HOST}/index.html`)
    const m = r.text.match(/index-[A-Za-z0-9_-]+\.js/)
    if (!m) return skip(`线上首页里没找到 index-*.js（可能被「页面访问提示」中间页拦下，HTTP ${r.status}）`)
    return local.includes(m[0])
      ? ok(`线上 ${m[0]} == 本地 ${m[0]}`)
      : bad(`线上是 ${m[0]}，本地是 ${local.join('/')} —— dist/ 还没传上去（或传了旧的）`)
  } catch (e) {
    return skip(`抓不到静态托管首页：${e.name === 'AbortError' ? '超时' : e.message}`)
  }
})

/* ---------- 组 G · 红线与前端安全 ---------- */

add('G', 'G1', '源码里没有招聘网站域名', '扫 src/ 的 zhipin / maimai / liepin / 51job / lagou', '命中 0', () => {
  const files = listRepoFiles().filter((f) => f.startsWith('projects/jiance/src/'))
  const hits = scan(files, /zhipin|maimai|liepin|51job|lagou/i)
  return hits.length === 0
    ? ok(`扫了 ${files.length} 个源文件，命中 0`)
    : bad(
        `命中 ${hits.length} 处（AGENTS.md 附三第 3 条明令禁止）：\n      ${hits
          .slice(0, 5)
          .map((h) => `${h.file}:${h.line}`)
          .join('\n      ')}`
      )
})

add('G', 'G2', 'contact 没混进提示词模块', '扫 src/data/prompts.js 里的 contact', '只有注释命中', () => {
  const f = 'projects/jiance/src/data/prompts.js'
  if (!existsSync(path.join(REPO, f))) return skip('找不到 prompts.js')
  const hits = scan([f], /contact/)
  const nonComment = hits.filter((h) => !isComment(h.text))
  return nonComment.length === 0
    ? ok(`命中 ${hits.length} 处，全在注释里（红线：联系方式绝不进提示词）`)
    : bad(
        `非注释命中 ${nonComment.length} 处 —— 联系方式可能被拼进提示词了：\n      ${nonComment
          .map((h) => `${h.line}  ${h.text}`)
          .join('\n      ')}`
      )
})

add('G', 'G3', '没有直接塞 HTML / eval', '扫 src/ 的 dangerouslySetInnerHTML / innerHTML / eval(', '命中 0', () => {
  const files = listRepoFiles().filter((f) => f.startsWith('projects/jiance/src/'))
  const hits = scan(files, /dangerouslySetInnerHTML|innerHTML|eval\(/)
  const nonComment = hits.filter((h) => !isComment(h.text))
  return nonComment.length === 0
    ? ok(`扫了 ${files.length} 个源文件；命中 ${hits.length} 处（全注释），非注释 0`)
    : bad(
        `命中 ${nonComment.length} 处：\n      ${nonComment
          .slice(0, 5)
          .map((h) => `${h.file}:${h.line}`)
          .join('\n      ')}`
      )
})

add('G', 'G4', '没偷偷引外部资源', '扫 src/ 与 index.html 的 CDN / 在线字体', '命中 0', () => {
  const files = [
    ...listRepoFiles().filter((f) => f.startsWith('projects/jiance/src/')),
    'projects/jiance/index.html',
  ]
  const hits = scan(files, /fonts\.googleapis|cdn\.jsdelivr|unpkg\.com|cdnjs\.cloudflare|at\.alicdn\.com/)
  const nonComment = hits.filter((h) => !isComment(h.text))
  return nonComment.length === 0
    ? ok(`扫了 ${files.length} 个文件；非注释命中 0（零外部依赖口径）`)
    : bad(
        `非注释命中 ${nonComment.length} 处：\n      ${nonComment
          .slice(0, 5)
          .map((h) => `${h.file}:${h.line}  ${h.text.slice(0, 70)}`)
          .join('\n      ')}`
      )
})

/* ---------- 组 H · 重复写入（默认关，--with-write 才跑） ---------- */

/** 探针数据的识别标记：用**纯 ASCII**，避免跟人类写的备注撞车 */
const PROBE_MARK = 'verify-project-probe'
const PROBE_NOTE = `自检探针（可删） ${PROBE_MARK}`

add('H', 'H1', '同一 clientToken 提交两次：第二次被拒（409）', 'POST 两次相同 clientToken', '201 然后 409 duplicate_submission', async () => {
  if (!FLAGS.withWrite) return skip('默认关闭（会往云端真写数据）；要跑加 --with-write')
  if (FLAGS.noNet) return skip('--no-net')
  if (!GATEWAY) return skip('拿不到网关地址')
  const token = 'verifyprobe' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const row = {
    date: new Date().toISOString().slice(0, 10),
    amount: 0.01,
    type: '支出',
    category: '其他',
    note: PROBE_NOTE,
    clientToken: token,
  }
  const post = () =>
    httpGet(`${GATEWAY}/api/expenses`, { 'Content-Type': 'application/json' }, { method: 'POST', body: JSON.stringify(row) })
  try {
    const a = await post()
    if (a.status !== 201) return bad(`第一次期望 201，实得 ${a.status}：${a.text.slice(0, 90)}`)
    const b = await post()
    if (b.status !== 409) {
      return bad(`第二次期望 409（防重复提交），实得 ${b.status} —— 同一令牌写进去两条了！${b.text.slice(0, 70)}`)
    }
    const code = b.json && b.json.error && b.json.error.code
    if (code !== 'duplicate_submission') return bad(`409 了但 error.code 是「${code}」，期望 duplicate_submission`)
    const id = a.json && a.json.data && a.json.data.id
    return ok(`201 → 409 duplicate_submission（id=${id}；H3 会把它删掉）`)
  } catch (e) {
    return skip(`连不上网关：${e.name === 'AbortError' ? '超时' : e.message}`)
  }
})

add('H', 'H2', '非法分类被拦（400）', 'POST type=支出 + category=工资', '400 + field=category', async () => {
  if (!FLAGS.withWrite) return skip('默认关闭；要跑加 --with-write')
  if (FLAGS.noNet) return skip('--no-net')
  if (!GATEWAY) return skip('拿不到网关地址')
  const token = 'verifyprobe' + Date.now().toString(36) + 'x'
  try {
    const r = await httpGet(
      `${GATEWAY}/api/expenses`,
      { 'Content-Type': 'application/json' },
      {
        method: 'POST',
        body: JSON.stringify({
          date: new Date().toISOString().slice(0, 10),
          amount: 0.01,
          type: '支出',
          category: '工资', // 「工资」只属于「收入」
          note: PROBE_NOTE,
          clientToken: token,
        }),
      }
    )
    if (r.status !== 400) return bad(`期望 400（分类与类型不一致），实得 ${r.status}`)
    const f = r.json && r.json.error && r.json.error.field
    return f === 'category'
      ? ok(`400 + field=category：「${(r.json.error.message || '').slice(0, 40)}」`)
      : bad(`400 了但 error.field 是「${f}」，期望 category`)
  } catch (e) {
    return skip(`连不上网关：${e.name === 'AbortError' ? '超时' : e.message}`)
  }
})

add('H', 'H3', '清理探针（把写进去的测试数据删掉）', 'GET 找探针 → DELETE', '删干净', async () => {
  if (!FLAGS.withWrite) return skip('默认关闭；要跑加 --with-write')
  if (FLAGS.noNet) return skip('--no-net')
  if (!GATEWAY) return skip('拿不到网关地址')
  try {
    const r = await httpGet(`${GATEWAY}/api/expenses`)
    const rows = (r.json && r.json.data) || []
    const probes = rows.filter((x) => typeof x.note === 'string' && x.note.includes(PROBE_MARK))
    if (probes.length === 0) return ok('没有残留探针')
    const failed = []
    for (const p of probes) {
      const d = await httpGet(`${GATEWAY}/api/expenses/${encodeURIComponent(p.id)}`, {}, { method: 'DELETE' })
      if (d.status < 200 || d.status >= 300) failed.push(`${p.id}(${d.status})`)
    }
    return failed.length === 0
      ? ok(`清掉 ${probes.length} 条残留探针`)
      : bad(`这些没删掉：${failed.join(' / ')}`)
  } catch (e) {
    return skip(`连不上网关：${e.name === 'AbortError' ? '超时' : e.message}`)
  }
})

/* ============================================================
   第 6 段 · 跑起来 + 打报告
   ============================================================ */

const selected = FLAGS.groups ? checks.filter((k) => FLAGS.groups.includes(k.group)) : checks

const w = (s) => process.stdout.write(s)
const stamp = new Date().toLocaleString('zh-CN', { hour12: false })

w('\n' + BOLD('简册 · 发布前自检') + '  ' + DIM('verify-project') + '\n')
w(DIM(`仓库 ${REPO}\n时间 ${stamp}\n`))
w(DIM('─'.repeat(72)) + '\n')

const counts = { PASS: 0, FAIL: 0, SKIP: 0 }
let curGroup = ''

for (const k of selected) {
  if (k.group !== curGroup) {
    curGroup = k.group
    w('\n' + BOLD(`组 ${curGroup}`) + '\n')
  }
  const line = async () => {
    try {
      return await k.run()
    } catch (e) {
      return skip(`检查项自己抛错了：${e && e.message ? e.message : e}`)
    }
  }
  // eslint-disable-next-line no-await-in-loop
  const r = await line()
  counts[r.status] += 1
  const mark = r.status === 'PASS' ? GREEN('✅ PASS') : r.status === 'FAIL' ? RED('❌ FAIL') : YELLOW('⏭ SKIP')
  w(`  ${mark} ${k.id} ${k.title}\n`)
  if (FLAGS.explain) w(DIM(`         怎么查：${k.how}\n         通过标准：${k.expect}\n`))
  w(`         ${DIM('证据：')}${r.evidence}\n`)
  if (r.status === 'FAIL' && !FLAGS.explain) w(DIM(`         怎么查：${k.how}｜通过标准：${k.expect}\n`))
}

w('\n' + DIM('─'.repeat(72)) + '\n')
const total = counts.PASS + counts.FAIL + counts.SKIP
w(
  BOLD('共 ') +
    BOLD(String(total)) +
    BOLD(' 项：') +
    GREEN(`通过 ${counts.PASS}`) +
    ' · ' +
    (counts.FAIL ? RED(`失败 ${counts.FAIL}`) : DIM('失败 0')) +
    ' · ' +
    (counts.SKIP ? YELLOW(`跳过 ${counts.SKIP}`) : DIM('跳过 0')) +
    '\n'
)

if (counts.FAIL > 0) {
  w(RED('结论：不合格，不能发布。先把上面 FAIL 的处理掉。') + '\n\n')
} else if (counts.SKIP > 0) {
  w(YELLOW('结论：没有 FAIL，但有跳过项 —— 跳过 ≠ 通过，发布前请把它们变成 PASS。') + '\n\n')
} else {
  w(GREEN('结论：全部通过，可以发布。') + '\n\n')
}

process.exit(counts.FAIL > 0 ? 1 : 0)
