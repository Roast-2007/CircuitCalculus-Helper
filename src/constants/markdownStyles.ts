import { KATEX_BASE_CSS } from "./katexCss";

const KATEX_DOCUMENT_CSS = KATEX_BASE_CSS.replace(/@font-face\{.*?\}/g, "");

export const MARKDOWN_DOCUMENT_CSS = `
${KATEX_DOCUMENT_CSS}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 15px;
  line-height: 1.7;
  color: #1a1a1a;
  padding: 4px 0;
  overflow-x: hidden;
  -webkit-text-size-adjust: 100%;
  word-break: break-word;
}
h1 { font-size: 20px; font-weight: 700; margin: 14px 0 8px; }
h2 { font-size: 17px; font-weight: 700; margin: 12px 0 6px; }
h3 { font-size: 15px; font-weight: 600; margin: 10px 0 4px; }
p { margin: 6px 0; }
ul, ol { padding-left: 22px; margin: 6px 0; }
li { margin: 3px 0; }
code {
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
}
pre {
  background: #f5f5f5;
  padding: 14px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 10px 0;
  border: 1px solid #e8e8e8;
}
pre code { background: none; padding: 0; border-radius: 0; }
blockquote {
  border-left: 4px solid #4A90D9;
  padding-left: 14px;
  margin: 10px 0;
  color: #555;
}
table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 14px; }
th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
th { background: #f5f5f5; font-weight: 600; }
a { color: #4A90D9; text-decoration: none; }
img { max-width: 100%; border-radius: 8px; margin: 10px 0; }
hr { border: 0; border-top: 1px solid #e5e5ea; margin: 12px 0; }
.katex-display { margin: 10px 0; overflow-x: auto; overflow-y: hidden; padding: 4px 0; }
.katex { font-size: 1.08em; }
.math-render-error {
  color: #d32f2f;
  font-style: italic;
  padding: 2px 4px;
  background: #fff0f0;
  border-radius: 4px;
}
.render-error {
  color: #d32f2f;
  font-style: italic;
  padding: 8px;
  background: #fff0f0;
  border-radius: 6px;
  margin: 8px 0;
}
`;
