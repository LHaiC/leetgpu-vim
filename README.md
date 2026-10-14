# Vim for LeetGPU

给 [leetgpu.com](https://leetgpu.com/) 的 Monaco 代码编辑器加上 Vim 键位，基于
[monaco-vim](https://github.com/brijeshb42/monaco-vim)（CodeMirror vim 的移植）。

> 非官方项目：与 LeetGPU 无隶属、无背书关系。

- 目标页面：`https://leetgpu.com/*`（`/playground`、题目页）
- 权限：**无**（没有 `permissions`、没有 `host_permissions`、没有 background worker，不联网）
- 兼容：Chromium 内核 **111+**（Chrome / Edge / Brave / Opera）。Firefox 未验证
- 许可：MIT

## 安装

完整步骤（Release 下载、源码安装、更新、排错、商店发布）见 **[INSTALL.md](INSTALL.md)**。简短版：

1. `chrome://extensions` → 打开右上角「开发者模式」
2. 点「加载已解压的扩展程序」，选择本目录（包含 `manifest.json` 的那一层）
3. 打开 <https://leetgpu.com/playground>，编辑器右下角出现 `VIM` 徽标、底部出现状态行

## 使用

| 操作 | 说明 |
| --- | --- |
| 点击编辑器 | 进入 Vim：`Esc` 回普通模式，`i`/`a`/`o` 插入，`dd`/`yy`/`p`、`/` 搜索、`:` 命令行 |
| 状态行 | 显示模式（`--NORMAL--` / `--INSERT--` / `--VISUAL--`）、`:`、`/` 的输入框、右侧按键缓冲 |
| 开关 | 点击右下角 `VIM` 徽标，或按 `Alt+Shift+V` |
| 记忆 | 开关状态按站点存在 `localStorage["vim-for-leetgpu:enabled"]`，刷新后保持 |
| 站点快捷键 | `Ctrl/Cmd+Enter`（运行）保持可用：hook 在挂载 Vim 前主动放行该组合键 |
| 调试 | 控制台可用 `__vimForLeetGpu.status()` / `.toggle(false)` / `.rescan()` |

`:` 支持 monaco-vim 自带的 ex 命令集与行号跳转（`:10` 已实测；`:w`、`:map` 等由上游实现，
支持程度取决于 monaco-vim 本身）。

## 目录结构

```
manifest.json             MV3 清单；唯一的 content_scripts 声明（MAIN world，document_start）
src/vim-hook.js           MAIN world：发现编辑器、挂载/卸载 monaco-vim、状态行、开关
src/vim-ui.css            状态行与徽标样式（content_scripts.css 注入）
vendor/monaco-vim.js      monaco-vim@0.4.4（由 tools/vendor.mjs 生成，含 UMD 头补丁）
vendor/monaco-vim.LICENSE 上游 MIT 许可证
tools/vendor.mjs          下载 + 校验 sha512 + 打补丁；--check 供 CI 校验
tools/build.mjs           打包 dist/leetgpu-vim-<版本>.zip（零依赖、可复现）
tools/make-icons.py       生成 icons/*.png
icons/                    16/32/48/128 图标
.github/workflows/        ci.yml（校验 + 打包 artifact）、release.yml（tag 发布 zip）
INSTALL.md                安装教程（普通用户 + 开发者 + 排错）
```

## 实现要点

**1. monaco-vim 的 UMD 头必须打补丁**（`tools/vendor.mjs` 里有完整说明）

- leetgpu.com 从 `cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs` 以 AMD 方式加载 Monaco，
  因此页面上存在 `window.monaco`，同时也存在 `define.amd`。
- 上游 UMD 在检测到 `define.amd` 时会走 AMD 分支（`define([...], factory)`），不会产生
  `window.MonacoVim`；而且它在**加载时**就把 `window.monaco` 捕获进闭包，不能早于 Monaco 加载。
- 补丁把文件头替换为普通 IIFE：跳过 CJS/AMD 分支，并用 `Proxy` **惰性**读取 `window.monaco`。
  因此文件可以在 `document_start` 注入，等站点加载完 Monaco 后自然生效。模块主体一行未改。

**2. 全部代码跑在 MAIN world**

`manifest.json` 里 `"world": "MAIN"`，页面脚本与扩展脚本共享同一 `window`：

- 不需要 `web_accessible_resources`，不受页面 CSP 影响；
- 不需要 `chrome.*` 权限，所以扩展不申请任何权限；
- 与 Monaco 加载时序无关：hook 只用「轮询 + create 拦截」，不做任何修改页面的注入。

**3. 编辑器发现与 SPA 生命周期**（`src/vim-hook.js`）

- 每 150ms 轮询 `window.monaco`，出现后拦截 `monaco.editor.create`（新编辑器立即挂载）；
- 每秒用 `monaco.editor.getEditors()` 兜底扫描 + 清理已销毁的编辑器（连续 3 次探测不到 DOM 才卸载，
  避免 React 重渲染时抖动）；
- 路由切换、编辑器重建（`/playground` ↔ 首页演示编辑器 ↔ 题目页）都会自动重新挂载；
- 一个编辑器一条状态行，只显示当前聚焦的那条；`:`/`/` 的输入框获得焦点时状态行不会被隐藏。

**4. 站点快捷键不被打断**

monaco-vim 会忽略「浏览器事件已被 `preventDefault()`」的按键（上游 README 的约定）。
hook 在 `initVimMode()` 之前注册 `onKeyDown`，对 `Ctrl/Cmd+Enter` 调用 `preventDefault()`，
所以按键会继续冒泡到站点自己的运行逻辑。

## 构建与发布

| 命令 | 作用 |
| --- | --- |
| `node tools/vendor.mjs` | 下载 monaco-vim@0.4.4、校验 sha512、打补丁、写入 `vendor/` |
| `node tools/vendor.mjs --check` | 只校验：重新下载并断言 `vendor/` 与固定版本 + 补丁逐字节一致（CI 用） |
| `node tools/build.mjs` | 打包 `dist/leetgpu-vim-<版本>.zip`（零依赖，条目排序 + 固定时间戳，输出可复现） |
| `node tools/build.mjs --expect-tag v1.0.0` | 额外断言 git tag 与 `manifest.json` 版本一致（发布用） |
| `npm run check` / `npm run build` | 上面两条命令的 npm 别名（`package.json` 无任何依赖） |
| `python3 tools/make-icons.py` | 重新生成 `icons/*.png` |

自动化（`.github/workflows/`）：

- **ci.yml**：push / PR 时执行 `vendor --check`、脚本语法检查、`manifest.json` 校验、打包 zip 并上传 artifact；
- **release.yml**：推送 `v*` tag 时校验 + 打包，再用 `gh release create` 把 zip 挂到 GitHub Release。

发布流程：改 `manifest.json`（和 `package.json`）的版本号 → 提交 → `git tag v1.0.0 && git push origin v1.0.0`。

zip 不能直接安装：用户解压后「加载已解压的扩展程序」，这是未上架商店时的标准分发方式
（未上架商店的扩展也无法自动更新）。想上架见 INSTALL.md 末尾。

## 第三方依赖：为什么不用 git submodule

`monaco-vim` **没有**作为 submodule，而是以「固定版本 + 校验和的 vendored 产物」随仓库提交：

- 我们消费的是上游的**发布产物**（npm 包里的 `dist/monaco-vim.umd.js`），并且只改它的 UMD 头。
  submodule 指向源码树，要得到可用文件得 `pnpm install && pnpm build`（tsdown），
  产出的 bundle 与 npm 上发布的并不逐字节一致 —— 补丁的前缀断言会失效，构建也不再可复现。
- submodule 需要 `git clone --recursive` 才能拿到内容，用户漏了参数扩展就直接失效；
  vendored 文件克隆即用，也能离线打包。
- 依赖固定在 `tools/vendor.mjs` 的 `UPSTREAM`（版本 + tarball URL + sha512），
  `--check` 会在 CI 里重新下载比对：来源可追溯，依赖漂移会立刻失败。

什么时候才该换成 submodule：需要跟随上游源码改动时（例如自己给 monaco-vim 提特性）。
那时应同时把构建脚本从「下载 npm 包」改成「读取 submodule 源码构建」，否则两条路径会打架。

## 验证清单（手工冒烟）

1. `/playground`：状态行出现、`dd` 删行、`i` 插入、`Esc` 回普通模式、`:10` 跳行、`/` 搜索；
2. `Alt+Shift+V` 关掉后按键按原样输入、徽标显示 `VIM OFF`；再开一次编辑器自动拿回焦点；
3. 刷新后开关状态保持；`/challenges` 等无编辑器页面不显示徽标；
4. `Ctrl+Enter` 仍能触发站点的运行逻辑；控制台无报错。

## 已知限制

- monaco-vim 是 CodeMirror vim 的移植，`:%s/...` 之类的高级 ex 命令、宏等支持有限（上游限制）。
- 状态行是固定定位（`position: fixed`），会盖住页面最底部约 24px。
- 若站点将来不再暴露 `window.monaco` 全局（例如改成打包 ESM），需要改 `src/vim-hook.js`
  里的 `getMonaco()` / 编辑器发现逻辑。

## 许可证

本仓库代码：MIT，见 [LICENSE](LICENSE)。
`vendor/monaco-vim.js` 来自 [brijeshb42/monaco-vim](https://github.com/brijeshb42/monaco-vim)（MIT），
全文见 `vendor/monaco-vim.LICENSE` 与文件头注释。
