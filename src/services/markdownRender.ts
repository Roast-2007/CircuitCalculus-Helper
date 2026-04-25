import MarkdownIt from "markdown-it";
import katex from "katex";

type MarkdownItInstance = InstanceType<typeof MarkdownIt>;
type MarkdownStateInline = MarkdownItInstance["inline"]["State"] extends new (
  ...args: any[]
) => infer T
  ? T
  : never;
type MarkdownStateBlock = MarkdownItInstance["block"]["State"] extends new (
  ...args: any[]
) => infer T
  ? T
  : never;
type MarkdownToken = ReturnType<MarkdownItInstance["parse"]>[number];

function createMarkdownRenderer(): MarkdownItInstance {
  const markdown = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: true,
    typographer: false,
  });

  function renderMath(expression: string, displayMode: boolean): string {
    try {
      return katex.renderToString(expression.trim(), {
        displayMode,
        throwOnError: false,
        strict: "ignore",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "公式渲染失败";
      return `<span class="math-render-error" title="${markdown.utils.escapeHtml(message)}">${markdown.utils.escapeHtml(expression)}</span>`;
    }
  }

  markdown.inline.ruler.before(
    "escape",
    "math_inline",
    (state: MarkdownStateInline, silent: boolean): boolean => {
      const start = state.pos;
      const source = state.src;
      let opener = "";
      let closer = "";

      if (source.startsWith("\\(", start)) {
        opener = "\\(";
        closer = "\\)";
      } else if (
        source[start] === "$" &&
        source[start + 1] !== "$" &&
        source[start - 1] !== "$"
      ) {
        opener = "$";
        closer = "$";
      } else {
        return false;
      }

      const contentStart = start + opener.length;
      let cursor = contentStart;
      let contentEnd = -1;

      while (cursor < state.posMax) {
        if (source.startsWith(closer, cursor)) {
          contentEnd = cursor;
          break;
        }

        if (source[cursor] === "\\") {
          cursor += 2;
          continue;
        }

        cursor += 1;
      }

      if (contentEnd < 0) {
        return false;
      }

      const content = source.slice(contentStart, contentEnd);
      if (!content.trim()) {
        return false;
      }

      if (opener === "$" && (/^\s/.test(content) || /\s$/.test(content))) {
        return false;
      }

      if (!silent) {
        const token = state.push("math_inline", "math", 0);
        token.content = content;
        token.markup = opener;
      }

      state.pos = contentEnd + closer.length;
      return true;
    }
  );

  markdown.block.ruler.before(
    "fence",
    "math_block",
    (
      state: MarkdownStateBlock,
      startLine: number,
      endLine: number,
      silent: boolean
    ): boolean => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      const firstLine = state.src.slice(start, max).trim();

      let opener = "";
      let closer = "";
      if (firstLine.startsWith("$$")) {
        opener = "$$";
        closer = "$$";
      } else if (firstLine.startsWith("\\[")) {
        opener = "\\[";
        closer = "\\]";
      } else {
        return false;
      }

      let nextLine = startLine;
      let content = "";
      const hasSameLineCloser =
        firstLine.length > opener.length + closer.length && firstLine.endsWith(closer);

      if (hasSameLineCloser) {
        content = firstLine.slice(opener.length, -closer.length);
      } else {
        const openingRemainder = firstLine.slice(opener.length).trim();
        if (openingRemainder) {
          content = openingRemainder;
        }

        let found = false;
        while (nextLine + 1 < endLine) {
          nextLine += 1;
          const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
          const lineEnd = state.eMarks[nextLine];
          const lineText = state.src.slice(lineStart, lineEnd);
          const trimmedLine = lineText.trim();

          if (trimmedLine.endsWith(closer)) {
            const closingLine = trimmedLine.slice(0, -closer.length).trim();
            content = [content, closingLine].filter(Boolean).join("\n");
            found = true;
            break;
          }

          content = [content, lineText].filter(Boolean).join("\n");
        }

        if (!found) {
          return false;
        }
      }

      if (silent) {
        return true;
      }

      const token = state.push("math_block", "math", 0);
      token.block = true;
      token.content = content;
      token.map = [startLine, nextLine + 1];
      state.line = nextLine + 1;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] }
  );

  markdown.renderer.rules.math_inline = (
    tokens: MarkdownToken[],
    index: number
  ): string => renderMath(tokens[index].content, false);

  markdown.renderer.rules.math_block = (
    tokens: MarkdownToken[],
    index: number
  ): string => `${renderMath(tokens[index].content, true)}\n`;

  return markdown;
}

const markdownRenderer = createMarkdownRenderer();

export function renderMarkdownHtml(content: string): string {
  try {
    return markdownRenderer.render(content);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "渲染失败";
    const escapedContent = markdownRenderer.utils.escapeHtml(content);
    const escapedMessage = markdownRenderer.utils.escapeHtml(message);
    return `<p>${escapedContent}</p><div class="render-error">渲染错误: ${escapedMessage}</div>`;
  }
}
