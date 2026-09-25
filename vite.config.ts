import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from 'fs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, 'dist')

// 从 package.json 读取版本号
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

// ──── 构建自定义插件 ────

function chromeExtensionPlugin() {
  return {
    name: 'chrome-extension-build',
    buildStart() {
      // 清理 dist 目录
      if (existsSync(distDir)) {
        rmSync(distDir, { recursive: true, force: true })
      }
      mkdirSync(distDir, { recursive: true })
    },
    closeBundle() {
      // 修复 HTML 输出路径：public/index.html -> sidepanel.html
      const htmlFiles = [
        { src: 'public/index.html', dst: 'sidepanel.html' },
        { src: 'src/index.html', dst: 'index.html' },
      ]

      for (const { src, dst } of htmlFiles) {
        const htmlSrc = resolve(distDir, src)
        const htmlDst = resolve(distDir, dst)
        if (existsSync(htmlSrc)) {
          let html = readFileSync(htmlSrc, 'utf-8')
          // Vite 输出 HTML 在 dist/xxx/，资源在 dist/，所以引用路径都是 ../xxx
          // 移动到 dist/ 后，统一改成 ./
          html = html.replace(/(src|href)="\.\.\//g, '$1="./')
          writeFileSync(htmlDst, html)
          rmSync(htmlSrc)
        }
      }

      // 清理空的 src 目录
      const srcInDist = resolve(distDir, 'src')
      if (existsSync(srcInDist)) {
        try {
          rmSync(srcInDist, { recursive: true, force: true })
        } catch {
          /* ignore */
        }
      }

      // ──── 复制静态资源 ────

      // 复制 manifest.json
      copyFileSync(resolve(__dirname, 'manifest.json'), resolve(distDir, 'manifest.json'))

      // 复制 _locales（chrome.i18n 的 manifest 多语言词条）
      const localesSrc = resolve(__dirname, '_locales')
      const localesDst = resolve(distDir, '_locales')
      if (existsSync(localesSrc)) {
        mkdirSync(localesDst, { recursive: true })
        readdirSync(localesSrc).forEach((localeDir) => {
          const src = resolve(localesSrc, localeDir)
          if (!existsSync(src)) return
          mkdirSync(resolve(localesDst, localeDir), { recursive: true })
          copyFileSync(
            resolve(src, 'messages.json'),
            resolve(localesDst, localeDir, 'messages.json'),
          )
        })
      }

      // 复制 icons 目录（只拷贝 manifest 用到的 .png，源图等设计稿不进 dist）
      const iconsSrc = resolve(__dirname, 'icons')
      const iconsDst = resolve(distDir, 'icons')
      if (existsSync(iconsSrc)) {
        mkdirSync(iconsDst, { recursive: true })
        readdirSync(iconsSrc).forEach((file) => {
          if (file.endsWith('.png')) {
            copyFileSync(resolve(iconsSrc, file), resolve(iconsDst, file))
          }
        })
      }

      // Vite 打包 SW 会输出到 dist/service-worker.js，不需要手动复制
      // 删除重复的未打包 SW
      const swUnpacked = resolve(distDir, 'service-worker/index.js')
      if (existsSync(swUnpacked)) rmSync(swUnpacked, { force: true })

      // 复制 offscreen 文档
      const offscreenDir = resolve(__dirname, 'src/offscreen')
      const offscreenDst = resolve(distDir, 'offscreen')
      mkdirSync(offscreenDst, { recursive: true })
      if (existsSync(offscreenDir)) {
        readdirSync(offscreenDir).forEach((file) => {
          copyFileSync(resolve(offscreenDir, file), resolve(offscreenDst, file))
        })
      }

      // 复制 lib
      const libDir = resolve(__dirname, 'src/lib')
      const libDst = resolve(distDir, 'lib')
      mkdirSync(libDst, { recursive: true })
      if (existsSync(libDir)) {
        readdirSync(libDir).forEach((file) => {
          if (file.endsWith('.js') || file.endsWith('.min.js')) {
            copyFileSync(resolve(libDir, file), resolve(libDst, file))
          }
        })
      }

      console.log('[chrome-extension] 构建完成！扩展位于 dist/ 目录')
    },
  }
}

export default defineConfig({
  plugins: [vue(), chromeExtensionPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // vue-i18n esm-bundler 构建特性开关（按官方文档配置，tree-shake 掉未用能力）
    __VUE_I18N_FULL_INSTALL__: JSON.stringify(true),
    __VUE_I18N_LEGACY_API__: JSON.stringify(false),
    __INTLIFY_PROD_DEVTOOLS__: JSON.stringify(false),
    __INTLIFY_JIT_COMPILATION__: JSON.stringify(true),
  },
  build: {
    outDir: distDir,
    emptyOutDir: false,
    rollupOptions: {
      input: {
        // Side Panel 入口
        sidepanel: resolve(__dirname, 'public/index.html'),
        // Service Worker 入口
        'service-worker': resolve(__dirname, 'src/service-worker/index.ts'),
        // Content Script 入口
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  base: './',
  optimizeDeps: {
    exclude: ['vue'],
  },
})
