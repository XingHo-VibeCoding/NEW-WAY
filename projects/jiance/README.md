# 简册本体（v1.12 起 · React + Vite）

> 这是 Day 15 起的简册代码目录。前 13 天的成果是根目录的 `index.html`（已删）；Day 15 重大路线调整改成 React + Vite。

## 启动

```bash
# 安装依赖（首次或依赖变化时）
npm install

# 本地开发（浏览器自动刷新）
npm run dev

# 生产构建（产物在 dist/）
npm run build

# 本地预览构建产物
npm run preview
```

## 目录结构

```
jiance/
├── package.json         依赖清单 + npm 命令
├── vite.config.js       Vite 构建配置
├── index.html           React 入口 HTML
├── src/                 React 源码
│   ├── main.jsx           启动点 + HashRouter
│   ├── App.jsx            路由表（6 个页面）
│   ├── pages/             6 个页面
│   │   ├── Start.jsx        主界面（卡牌台，v1.12 已 1:1 骨架实现）
│   │   ├── Home.jsx         底牌页（占位）
│   │   ├── Expense.jsx      记一笔（占位）
│   │   ├── Entry.jsx        记一条（占位）
│   │   ├── Resume.jsx       简历预览（占位）
│   │   └── Match.jsx        岗位匹配（占位）
│   ├── components/        通用组件
│   │   └── Nav.jsx          顶部导航（v1.12 收窄到只剩一个"主界面"按钮）
│   ├── hooks/             自定义 hook（Day 16+ 补 localStorage 适配）
│   └── styles/            样式文件（Day 16+ 按页面拆分）
├── dist/                构建产物（部署用，不进仓库）
├── node_modules/        npm 依赖（不进仓库）
└── cloudbase/           CloudBase 后端预制件
    ├── DEPLOY.md          部署手册
    ├── api-contract.md    4 表 / 15 接口契约
    └── functions/health/  GET /api/health 云函数
```

## v1.12 已实现

- ✅ 主页（卡牌台）骨架 1:1 —— 5 张牌沿浅弧排列 + 鼠标跟随倾斜 + 点击翻牌跳转
- ✅ 5 个占位页（每个标注推到哪天复刻）
- ✅ Nav 收窄到只剩"主界面"按钮
- ✅ `npm run build` 通过（dist 263 KB JS + 3 KB CSS）
- ✅ CloudBase `/api/health` 部署（详见 `cloudbase/DEPLOY.md`）

## v1.12 推迟到 Day 16-20

1. 5 个功能页完整 1:1 复刻（账簿面朱砂 / 简历面玻璃 / 双面对称 / print 还原）
2. 装订册三件套（装订线 + 暗纹 + 印章 + 折痕 + @media print 撕干净）
3. 场景穿越动画（5 张牌各自的 900ms 小戏剧）
4. AI 通道迁移（WorkBuddy 网关 → `src/services/llm.js`）
5. 联动板块①（底牌三数 + 简历抬头 + 匹配重跑）
6. localStorage 适配 hook（`src/hooks/useLocalStorage.js`）
7. 自检脚本（Temp / png_scan.js 重写适配 React）
8. 业务接口 4 表 / 15 个（按 `cloudbase/api-contract.md` 实现）

## 部署

- **本地**：见上文「启动」
- **生产**：`npm run build` → 把 `dist/` 里的内容（**index.html + favicon.svg + icons.svg + assets/**）**扁平化**传到 CloudBase 静态托管的根目录
- **后端**：`cloudbase/functions/health/` → CloudBase 云函数（事件型，不要选 HTTP 云函数）

详见 `cloudbase/DEPLOY.md`。

## 关联文档

- 主页：`../README.md`
- 产品需求：`../PRD.md`（v1.12）
- 技术设计：`../TECH_DESIGN.md`（v1.12，4.1 / 4.2 改 React）
- 协作规则：`../AGENTS.md`（附三新增 React/Vite 术语）
- 接口契约：`cloudbase/api-contract.md`（v1.0，4 表 / 15 接口）