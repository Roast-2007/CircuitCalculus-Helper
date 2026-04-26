# CLAUDE.md

## Project Summary

这是一个基于 Expo + React Native 的 Android 应用，用于：
- 拍照 / 选图识别数学题与电路图
- 用 SiliconFlow Kimi 做视觉识别与结构化电路提取
- 用 DeepSeek 做数学、电路分析与流式解答
- 用本地 Markdown / LaTeX 解析结果注入 WebView 展示答案
- 用结构化 topology 展示和编辑电路
- 保留多会话历史，支持新对话、历史对话切换和当前会话清空

## Important Working Notes

### Build commands

#### Type check

```bash
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.json
```

#### Expo dev

```bash
npx expo start
```

不要主动启动开发服务器，除非用户明确要求；当前更偏好直接构建 release APK 后在真机验证。

#### Android debug

```bash
npx expo run:android
```

#### Android release APK

用相对路径调用 gradlew.bat，管道 `tail` 只看尾部输出，避免上下文被撑爆：

```bash
"./android/gradlew.bat" -p "./android" assembleRelease 2>&1 | tail -20
```

release 产物路径：

```text
E:\Personal Files\ocr-math\android\app\build\outputs\apk\release\app-release.apk
```

如果用户要求”成品包”，默认指 release APK，不要只跑 debug。

#### 双版本构建（嵌入 Key / 无 Key）

当用户要求”build 两版放桌面”时：

1. 如果用户未在上下文中提供 API Key，使用 AskUserQuestion 索取硅基流动和 DeepSeek 的 key
2. 修改 `src/services/embeddedKeys.ts`：
   - `EMBEDDED.visual.apiKey` 填入硅基流动 key
   - `EMBEDDED.reasoning.apiKey` 填入 DeepSeek key
   - `getEmbeddedSettings()` 返回 `EMBEDDED`
3. 执行 `assembleRelease`，产物复制到 `C:\Users\wangh\Desktop\ocr-math-with-keys.apk`
4. 恢复 `embeddedKeys.ts`（apiKey 清空，返回 `null`）
5. 再次执行 `assembleRelease`，产物复制到 `C:\Users\wangh\Desktop\ocr-math-no-keys.apk`
6. `embeddedKeys.ts` 保持干净状态，不提交 key

### Icon pipeline

- `assets/icon.png` 必须是真正的 PNG，不能只是把 JPG 改扩展名
- `assets/adaptive-icon.png` 也要同步更新
- 修改图标资源后必须重新生成 Android 原生资源：

```bash
npx expo prebuild --platform android
```

否则 Android 端可能继续沿用旧的 launcher mipmap 资源。

### Conversation notes

- 会话历史使用 `src/services/conversationStorage.ts` 和 AsyncStorage 持久化
- API Key 继续只放 `src/services/storage.ts` / SecureStore，不要把大体积会话记录放进 SecureStore
- `HomeScreen.tsx` 中当前激活会话由 `activeConversationId` 派生，避免不同会话串消息
- 清空对话只清空当前会话，并同时重置输入框、待发送图片、review modal 状态和滚动位置
- 新题建议开启新对话；长期复用同一个对话会影响识别与解答准确率

### Streaming notes

- `src/services/api.ts` 使用 XHR 增量解析流式响应
- 处理流式问题时优先检查 chunk buffer 是否跨分片丢数据
- Kimi 和 DeepSeek 默认关闭静默超时，只要没有服务端结束、HTTP 错误、网络错误或用户取消，就继续等待
- Kimi 已启用 thinking，流式响应中 reasoning_content 解析并展示为可折叠的"推理过程"
- Kimi 请求已拆分 system/user 消息，图片压缩为 1200px/0.65 JPEG
- `HomeScreen.tsx` 中要避免过早释放 `processing`
- 发起新请求前要先取消旧的 active stream

### Markdown / LaTeX notes

- `src/components/MarkdownView.tsx` 仍使用 WebView 承载 HTML 和高度回传
- Markdown 在本地通过 `src/services/markdownRender.ts` 的 `markdown-it` 渲染
- LaTeX 在本地通过 `katex.renderToString` 渲染，不依赖 CDN 脚本
- 样式在 `src/constants/markdownStyles.ts`，KaTeX CSS 常量在 `src/constants/katexCss.ts`
- 不要重新加入远程 CDN、外部脚本或文件访问能力
- 当前已做内容节流，避免流式 token 到来时频繁重建整份 HTML

### Circuit editing notes

- 电路 schema 入口在 `src/types/index.ts`
- catalog 在 `src/constants/circuitCatalog.ts`
- parser 在 `src/services/circuitParser.ts`
- serializer 在 `src/services/circuitSerialize.ts`
- layout 入口在 `src/services/circuitLayout.ts`
- 新的 schematic layout 在 `src/services/circuitLayoutGraph.ts`
- 可视化组件在 `src/components/circuit/`
- 标准电路符号在 `src/components/circuit/symbols/StandardCircuitGraphic.tsx`
- 当前是“自动布局 + inspector 编辑”，不是完整 CAD

### Circuit layout constraints

- 优先保留当前结构化电路 schema，不要退回到只靠 `nodeA/nodeB` 的旧模型
- 新 schematic layout 主要处理二端元件：source、passive、wire、受控源等
- 布局策略是左侧 source、上方主通路、下方 return rail、竖向支路、同节点对并联支路
- 受控源 `vcvs` / `vccs` / `ccvs` / `cccs` 要作为可见元件参与主通路或并联支路，不能因为节点重复被丢掉
- 同一 node pair 上的多个元件要画成并联分支，不能只保留第一个元件
- `a` / `b` 等端口可以用 synthetic terminal 呈现，内部逻辑节点可用 hidden role 隐藏
- 多端器件或暂不支持的拓扑应回退到旧 layout heuristic，至少保证可见，不要直接失败

## Repository Notes

- GitHub remote: `https://github.com/Roast-2007/CircuitCalculus-Helper.git`
- 项目使用 MIT License 开源
- Android 原生目录是有意保留的，因为 release APK 构建依赖它
- push 只在用户明确要求时执行；当前用户已明确要求代为 push

## Constraints

- 不要把真实 API Key 写入代码或文档
- 不要提交 `.claude/`、`.idea/`、`.playwright-mcp/`、`node_modules/`、Android build outputs、签名证书或其他本地私密文件
- 根目录 `CLAUDE.md` 应提交；项目内 `.claude/` 目录不应提交
- 如果修改图标、Android 原生资源、Gradle 构建链，请优先验证 release 构建
- 如果只改文档或忽略规则，可以不重新构建 APK，但提交前仍要检查 git status
- 请在有代码改动完成后立刻commit，并在 commit message 里注明改动内容和相关文件路径，保持提交记录清晰有意义
- 每次代码修改后必须立即 commit 并执行 release APK 构建，构建命令：
  ```powershell
  & 'E:\Personal Files\ocr-math\android\gradlew.bat' -p 'E:\Personal Files\ocr-math\android' assembleRelease
  ```
  构建产物路径：`android/app/build/outputs/apk/release/app-release.apk`
