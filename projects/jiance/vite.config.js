import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    /* Day 20：产物平铺到 dist 根目录（Vite 默认是 dist/assets/）。
       ------------------------------------------------------------
       为什么改：CloudBase 静态托管的「上传文件」**只能传到"你当前所在的目录"**，
       没有「选择目标路径」的对话框（Day 20 实测踩过）。产物带 assets 子目录时，
       每次部署都要先在控制台里点进 assets 再传，容易传错位置 ——
       实测连续两次把文件传到了根目录，页面白屏。
       平铺之后：dist 里就是 index.html + 一个 .js + 一个 .css，
       **部署只要传 index.html（外加当次构建的 .js/.css）**，不必再进任何子目录。

       ⚠️ 代价（诚实记在这里，别忘）：
         1. 与 Vite 默认目录约定不同 —— 看官方教程会看到 assets/，那是默认值
         2. 每次 `npm run build` 会生成**新的哈希文件名**，
            旧的会留在 dist 里（Vite 会清空 dist，所以实际是全新的三个文件）；
            云端旧文件仍在，属正常残留，无人引用
         3. 以后若资源变多（图片/字体），会全平铺在 dist 根目录 */
    assetsDir: '',
  },
})
