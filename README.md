# CircuitCalculus Helper

CircuitCalculus Helper 是一个基于 Expo + React Native 的 Android 应用，用于拍照 / 选图识别数学题与电路题，并结合多模态识别、结构化电路拓扑和大模型推理给出解答。

作者：串烧Roast
License：MIT

## 功能特性

- 拍照或从相册选择数学题 / 电路图
- 支持用户补充题目信息
- 使用 SiliconFlow Kimi 进行图像内容识别
- 使用 DeepSeek 进行数学与电路分析
- DeepSeek 流式推理与答案展示
- 长推理流式等待，不因 120 秒静默推理误报网络错误
- Markdown + LaTeX 本地渲染
- 多会话历史记录
- 新对话 / 历史对话一键切换
- 结构化电路 JSON 解析
- 电路拓扑编辑与 inspector 检查
- 标准 SVG 电路元件符号
- 支持电源、阻容感、二极管、开关、三极管、MOSFET、运放、变压器、独立源、受控源等基础类型
- 自动 schematic 布局：左侧电源、上轨主干、并联支路、竖直支路、下轨返回线、端点 a/b
- API Key 仅保存在本机 SecureStore 中

## 技术栈

- Expo SDK 54
- React 19
- React Native 0.81
- TypeScript
- React Navigation
- react-native-svg
- react-native-webview
- markdown-it
- KaTeX
- AsyncStorage
- Expo Image Picker / Image Manipulator / SecureStore

## 项目结构

```text
CircuitCalculus-Helper/
├── App.tsx
├── app.json
├── assets/
├── android/
├── src/
│   ├── components/
│   │   ├── circuit/
│   │   │   ├── symbols/
│   │   │   ├── CircuitCanvas.tsx
│   │   │   └── CircuitSymbol.tsx
│   │   ├── ChatBubble.tsx
│   │   ├── CircuitEditor.tsx
│   │   ├── ConversationHistoryModal.tsx
│   │   └── MarkdownView.tsx
│   ├── constants/
│   ├── screens/
│   ├── services/
│   │   ├── api.ts
│   │   ├── circuitLayout.ts
│   │   ├── circuitLayoutGraph.ts
│   │   ├── circuitParser.ts
│   │   ├── circuitSerialize.ts
│   │   ├── conversationStorage.ts
│   │   ├── markdownRender.ts
│   │   └── storage.ts
│   ├── theme.ts
│   └── types/
└── package.json
```

## 安装依赖

```bash
npm install
```

## 开发运行

```bash
npx expo start
```

Android 调试：

```bash
npx expo run:android
```

## 类型检查

```bash
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.json
```

## Android Release APK 构建

在 Windows / PowerShell 下推荐使用：

```powershell
& 'E:\Personal Files\ocr-math\android\gradlew.bat' -p 'E:\Personal Files\ocr-math\android' assembleRelease
```

构建产物：

```text
android/app/build/outputs/apk/release/app-release.apk
```

当前本机路径：

```text
E:\Personal Files\ocr-math\android\app\build\outputs\apk\release\app-release.apk
```

## API 配置

应用内需要用户自行配置：

- DeepSeek API Key
- SiliconFlow API Key
- DeepSeek 模型名
- SiliconFlow 模型名

默认模型：

- DeepSeek：`deepseek-v4-pro`
- SiliconFlow：`Pro/moonshotai/Kimi-K2.6`

不要把真实 API Key 提交到仓库。

## 使用建议

- 建议使用「全能扫描王」等工具预处理图片后再上传，可提升识别准确率。
- 新的题请开启新对话，不要反复使用同一个对话窗口，否则会影响识别与解答准确率。
- 电路题建议先检查 Kimi 识别出的拓扑，再提交 DeepSeek 分析。
- 复杂电路的自动布局仍可能需要在 inspector 中修正识别错误或端点连接。

## 电路 schema 支持

当前结构化电路模型支持：

- `nodes`
- `components`
- `connections`
- `controls`
- `layout`

当前支持的元件类型包括：

- `resistor`
- `capacitor`
- `inductor`
- `voltage_source`
- `current_source`
- `ground`
- `wire`
- `diode`
- `bjt`
- `mosfet`
- `opamp`
- `transformer`
- `switch`
- `probe`
- `vcvs`
- `vccs`
- `ccvs`
- `cccs`
- `unknown`

## 远程仓库

```text
https://github.com/Roast-2007/CircuitCalculus-Helper
```

## License

本项目基于 [MIT License](LICENSE) 开源。
