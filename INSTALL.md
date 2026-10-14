# 安装教程

「Vim for LeetGPU」是一个 Chrome/Edge 扩展（Manifest V3），只对 `leetgpu.com` 生效。
它没有上架 Chrome 应用商店，需要手动加载；下面是两种安装方式。

> 环境要求：Chromium 内核浏览器 **111+**（Chrome / Edge / Brave / Opera 均可）。
> Firefox 暂不支持（`manifest.json` 的 `world: "MAIN"` 与实现未在 Firefox 验证）。
> 扩展**不需要任何权限**，也不联网，只注入 `https://leetgpu.com/*`。

---

## 方式 A：从 Release 安装（推荐，普通用户）

1. 打开本仓库的 **Releases** 页面，下载最新版本的 `leetgpu-vim-<版本>.zip`。
2. 解压到任意目录（例如 `~/leetgpu-vim`）。注意：**要解压**，扩展不能直接从 zip 加载。
3. 在浏览器地址栏打开 `chrome://extensions`（Edge 是 `edge://extensions`）。
4. 打开右上角的 **开发者模式**。
5. 点 **加载已解压的扩展程序**，选择第 2 步解压出来的目录（里面有 `manifest.json`）。
6. 打开 <https://leetgpu.com/playground>，编辑器右下角出现 `VIM` 徽标、底部出现状态行即安装成功。

## 方式 B：从源码安装（开发者）

```sh
git clone https://github.com/LHaiC/leetgpu-vim.git
```

然后按方式 A 的第 3~5 步，直接选择 `leetgpu-vim` 仓库目录。

仓库里已经带好了打好补丁的 `vendor/monaco-vim.js`，**不需要 `npm install`、不需要构建**。
如果想自己确认依赖来源，可以跑一次校验（会重新下载 monaco-vim 并核对 sha512 与补丁）：

```sh
node tools/vendor.mjs --check
```

自己打包 zip：

```sh
node tools/build.mjs          # 输出 dist/leetgpu-vim-<版本>.zip
```

## 使用

| 操作 | 说明 |
| --- | --- |
| 点击编辑器 | 进入 Vim：`Esc` 普通模式，`i`/`a`/`o` 插入，`dd`/`yy`/`p`，`/` 搜索，`:` 命令行 |
| 状态行 | 显示 `--NORMAL--` / `--INSERT--` / `--VISUAL--`、按键缓冲，以及 `:`、`/` 的输入框 |
| 开 / 关 | 点击右下角 `VIM` 徽标，或按 `Alt+Shift+V` |
| 记忆 | 开关状态保存在 `localStorage["vim-for-leetgpu:enabled"]`，刷新后保持 |
| 运行代码 | `Ctrl/Cmd+Enter` 仍是站点自己的快捷键，不受扩展影响 |
| 排错 | 打开控制台执行 `__vimForLeetGpu.status()`（`toggle(false)` 关闭、`rescan()` 重新扫描） |

## 更新与卸载

- **更新**：手动加载的扩展不会自动更新。重新下载新版 zip → 覆盖解压目录 → 在
  `chrome://extensions` 里点扩展卡片上的「重新加载」按钮。
- **卸载**：在 `chrome://extensions` 里点「移除」；站点里的 `localStorage` 记录可留可删
  （浏览器设置 → 站点数据 → leetgpu.com）。

## 常见问题

**徽标和状态行都没有出现？**
1. 确认地址是 `https://leetgpu.com/...`（`chrome://extensions` 卡片上应显示「已启用」）；
2. 打开控制台看是否有 `[vim-for-leetgpu]` 开头的警告；
3. 执行 `__vimForLeetGpu.status()`，正常应返回 `{enabled: true, attachments: 1, ...}`；
4. `/challenges` 这类没有代码编辑器的页面不显示徽标，属预期行为。

**徽标出现但按键还是普通输入？**
说明 Monaco 编辑器没被挂上 Vim，先执行 `__vimForLeetGpu.status()` 看 `attachments`；
若为 0，请反馈 issue 并附上浏览器版本与控制台输出。

**会影响站点自己的快捷键吗？**
普通模式的按键会被 Vim 接管；`Ctrl/Cmd+Enter` 已显式放行。其它站点快捷键如果被吃掉，
可以在 issue 里说明具体组合。

**为什么不能像商店扩展一样自动更新 / 一键安装？**
未上架商店的扩展只能手动加载。若希望上架，需要 Chrome Web Store 开发者账号
（一次性 5 美元），把 `manifest.json` 所在目录打包上传即可，本项目未做商店发布。
