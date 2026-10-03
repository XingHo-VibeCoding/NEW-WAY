# 简册 · 术语与背景速查（AGENTS.md 的展开版）

> **2026-10-03 从 `AGENTS.md` 附三第 2 节移出。**
> 原因：那节是「每天开工前必读」的文件，不该塞技术科普和已实现的动画细节。
> 移出来的都是**查得到就够**的内容 —— 需要时来这里查，不必每天背。
>
> 留在 `AGENTS.md` 的是**口径纪律**（不许换词、不许做的事），那才是每次开工要过目的。

---

## 一、技术名词（大白话版，Day 16 React 迁移时引入）

- **React**：用户界面的「零件」库。把页面拆成独立零件（叫「组件」），每个零件自己管自己的数据（叫「状态」），改了一处其他相关零件自动跟着刷新。对比：Day 1-13 单文件版是用手写 JS 模拟了 React 这一套。**改用 React 不算能力升级，是范式重写** —— 见 `TECH_DESIGN.md` 4.1 / 4.2。
- **Vite**：React 项目的「装修队」。React 写的源码是「设计图」，浏览器看不懂；Vite 把设计图变成浏览器能跑的真实页面（`dist/` 目录）。自带开发服务器 —— 改一行代码浏览器自动刷新。`npm run build` 输出生产产物到 `dist/`。
- **组件 / component**：React 里的「零件」—— 一个 `.jsx` 文件 = 一个组件。可以嵌套（大组件里套小组件），可以复用（写一次、到处用）。
- **JSX**：HTML 嵌进 JS 里的写法（`return <div>...</div>` 而不是 `return '<div>...</div>'`）。**浏览器看不懂** —— 必须经 Vite 翻译。
- **npm**：装零件的「五金店」。`npm install` = 去五金店买零件；`npm install react` = 买 react 这一件；`package.json` = 五金店清单。
- **`npm run build`**：让 Vite 把设计图变成真实能住的房子（`dist/` 目录）。**部署前必经的一步**。
- **HashRouter / hash 路由**：浏览器地址栏 `#/...` 那一段作为路由依据。**不需要服务器配合** —— `#` 后的内容浏览器不发到服务器。React 习惯上比 BrowserRouter 简单（不用配 nginx）。
- **路由表**（Routes）：`<Routes>` + `<Route path="/home" element={<Home/>} />` —— 地址 → 组件 的对照单。
- **节点 / node_modules**：装好的零件仓库。**不进仓库** —— 每个开发者自己装。

---

## 二、场景穿越的 5 段剧本（Day 15 已实现）

从主界面点一张牌 → 牌翻 180° → 牌心演约 900ms → 切页（新页瞬间到位、零动效）。

| 门牌 | 剧本 | 具体演什么 |
|---|---|---|
| `#/home` | **账本翻开** | 栏线从左向右画 + 中缝出现 + 几条文本线渐显 |
| `#/expense` | **笔划过纸面** | 纸边 + 朱色笔尖沿弧线划过 + 划痕渐出 |
| `#/entry` | **打印纸落下** | 白纸从上方飘落、落地弹一下 + 三条朱色横线渐显 |
| `#/resume` | **纸面展开** | 左右两半从中心向两侧摊开，中缝一道亮线 |
| `#/match` | **雷达图辐射** | 中心环 + 6 条线从中心射出 + 6 个尖端圆点逐一亮起 |

**守住的纪律**：页面本身不动效（新页瞬间到位）—— 所有戏剧只在牌心完成。
这是 Day 15 秋鹰师亲自撤掉所有页面进出动效之后的妥协方案。

**实现位置**：`src/components/SceneTransition.jsx` + `SceneTransition.css`（11 个 `@keyframes`）。

---

## 三、双面背景纹理的参数出处（Day 17 落地）

**账簿面 · 深褐木纸**（`index.css` 的 `.pages:has(.page-ledger)`）
- 92° 纤维横纹，间隔 7px，`rgba(255,255,255,0.016)`（单像素线）
- 顶部 1000×600 暖微光，`rgba(233,214,168,0.05)`

**简历面 · 冷玻璃**（`.pages:has(.page-resume)`）
- 18% 位置 900×520 暖光晕 `rgba(201,161,74,0.13)`
- 88% 位置 700×480 暖光晕 `rgba(201,161,74,0.08)`
- 58° 斜纹，间隔 9px，`rgba(255,255,255,0.022)`

**卡片花纹**（`::before` 伪元素，不用 `background-image` —— 原因见 AGENTS.md 附四第 3 条）
- 账簿面：横纹 6px 间隔 + 右上角 420×300 暖光
- 简历面：45° 斜格 14px 间隔 + 左上 135° 亮面

---

## 四、当前字号与版面基准（Day 17 拍板）

调大小**只改 `index.css` 这 10 个数**，别动各页 CSS：

```
--fs-xs: 15px    --fs-sm: 17px    --fs-md: 18px    --fs-lg: 22px
--fs-xl: 26px    --fs-2xl: 38px   --fs-3xl: 50px
--page-w: 1200px   --card-pad: 40px
```

牌台与牌：`min(1320px)` / `min-height: 248px` / `padding: 46px 24px`。
简历纸内距：屏幕 `48px 72px 56px`，**打印 `24px !important`**。

---

## 五、提交前的验证配方（Day 17 实战攒下）

**看屏幕效果**
```
cd projects/jiance
node node_modules/vite/bin/vite.js build
node node_modules/vite/bin/vite.js preview --port 5211
chrome --headless=new --disable-gpu --hide-scrollbars --no-proxy-server \
  --window-size=1600,1300 --virtual-time-budget=6000 \
  "--screenshot=C:\绝对路径\某页.png" "http://localhost:5211/index.html#/home"
```

三条铁律（都是踩出来的）：
1. **`--screenshot` 必须给完整 Windows 反斜杠绝对路径** —— 给相对路径或正斜杠路径 → `拒绝访问 (0x5)`，文件不落地
2. **中文文件名会被 Chrome 拒写**（同上）—— 先落英文名，搬进工作区再改中文名
3. **必须拍 `preview` 的生产产物，不能拍 dev server（5199）** —— dev server 下截图字节不变 = Chrome 复用 profile 缓存，会让你误判"改了没生效"。独立 `--user-data-dir` 也无效。

**验打印件**
数导出的 PDF 里 `rg`/`RG` 彩色填充指令条数，**0 条才算过**。
- 导出：`chrome --headless=new --no-pdf-header-footer --print-to-pdf=C:\...\x.pdf "URL"`
- 想肉眼看打印态：把 `index.css` 最后那段 `@media print {...}` 抽成单独的 CSS 用 `<link>` 无条件加载，屏幕上直接就是打印件长什么样（**比 CDP 方案好用，本机没有 `ws` 库**）

**⚠️ 别用「饱和度」判彩色** —— PNG 全是 8bit，文字抗锯齿边缘（`rgb(103,191,255)`）饱和度高达 0.6，全是假警报。

**扫编码**（Day 16 踩过两次）
```python
# 每写完一个文件就扫：U+FFFD 乱码 + 误入的西里尔字母
if '\ufffd' in line: ...
if '\u0400' <= ch <= '\u04ff': ...
```

---

## 六、Git 推送

**本机 `credential.helper = helper-selector`（Windows 凭据管理器），它需要弹窗交互。**
小玉这边是非交互运行，**推不上去，必须秋鹰师自己跑**：
```
cd /d/梦空间 && git push origin main
```

**判据**：`credential.helper` 是 GUI 型助手（`helper-selector` / `manager` / `store GUI`）→ 必须人接手；
若是 `store`（读 `~/.git-credentials` 文件）→ AI 能自己处理。

**看到 `terminal prompts disabled` 就立刻停下交给人**，别自己换四种方法去磕。

**判定成功只看一条**：本地 `git rev-parse HEAD` == `git ls-remote origin main` 的 hash。
网络本身通常是通的（`unset http_proxy...` 后 curl github.com 测一下），别误判成网络问题。
