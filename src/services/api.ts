const SILICONFLOW_BASE = "https://api.siliconflow.cn/v1";
const DEEPSEEK_BASE = "https://api.deepseek.com/v1";

/** If no data received for this long, abort */
const DEFAULT_SILENCE_TIMEOUT = 120_000;

type Provider = "siliconflow" | "deepseek";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly provider?: Provider
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type CancelFn = () => void;

type StreamHandlers = {
  onData: (rawJson: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
  provider: Provider;
  silenceTimeoutMs?: number;
  disableSilenceTimeout?: boolean;
};

function getErrorMessage(status: number, providerLabel: string): string {
  if (status === 400) return `${providerLabel} 请求参数无效`;
  if (status === 401 || status === 403) return `${providerLabel} API Key 无效或已过期，请检查设置`;
  if (status === 404) return `${providerLabel} 模型或接口不存在`;
  if (status === 429) return `${providerLabel} API 请求过于频繁，请稍后重试`;
  if (status >= 500) return `${providerLabel} 服务暂时不可用，请稍后重试`;
  return `${providerLabel} 请求失败 (${status})`;
}

function getProviderLabel(provider: Provider): string {
  return provider === "siliconflow" ? "硅基流动" : "DeepSeek";
}

function parseErrorBody(responseText: string): string | null {
  try {
    const parsed = JSON.parse(responseText);
    const message =
      parsed?.error?.message ||
      parsed?.message ||
      parsed?.detail ||
      parsed?.msg ||
      null;
    return typeof message === "string" && message.trim() ? message.trim() : null;
  } catch {
    return null;
  }
}

function startXhrStream(
  url: string,
  headers: Record<string, string>,
  body: string,
  {
    onData,
    onDone,
    onError,
    provider,
    silenceTimeoutMs = DEFAULT_SILENCE_TIMEOUT,
    disableSilenceTimeout = false,
  }: StreamHandlers
): { abort: () => void } {
  const xhr = new XMLHttpRequest();
  let processedLength = 0;
  let pendingLine = "";
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let finished = false;
  let aborted = false;

  function clearSilence() {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function fail(error: Error) {
    if (finished) {
      return;
    }
    finished = true;
    clearSilence();
    onError(error);
  }

  function complete() {
    if (finished) {
      return;
    }
    finished = true;
    clearSilence();
    onDone();
  }

  function resetSilence() {
    if (disableSilenceTimeout) {
      return;
    }
    clearSilence();
    silenceTimer = setTimeout(() => {
      xhr.abort();
      if (!finished) {
        finished = true;
        onError(
          new ApiError(
            `响应超时：${Math.floor(silenceTimeoutMs / 1000)} 秒内未继续收到数据，请检查网络`,
            undefined,
            provider
          )
        );
      }
    }, silenceTimeoutMs);
  }

  function handleLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    if (trimmed === "data: [DONE]") {
      complete();
      return;
    }
    if (!trimmed.startsWith("data: ")) {
      return;
    }

    const payload = trimmed.slice(6).trim();
    if (!payload) {
      return;
    }

    onData(payload);
  }

  function processChunk(force = false) {
    const chunk = xhr.responseText.slice(processedLength);
    processedLength = xhr.responseText.length;
    if (!chunk && !force) {
      return;
    }

    pendingLine += chunk.replace(/\r/g, "");
    const lines = pendingLine.split("\n");
    pendingLine = force ? "" : lines.pop() || "";

    lines.forEach(handleLine);

    if (force && pendingLine.trim()) {
      handleLine(pendingLine);
      pendingLine = "";
    }
  }

  xhr.open("POST", url);
  Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
  xhr.responseType = "text";

  xhr.onprogress = () => {
    resetSilence();
    processChunk(false);
  };

  xhr.onloadend = () => {
    clearSilence();
    if (finished || aborted) {
      return;
    }

    const status = xhr.status;
    if (status >= 400) {
      const providerLabel = getProviderLabel(provider);
      const bodyMessage = parseErrorBody(xhr.responseText);
      fail(new ApiError(bodyMessage || getErrorMessage(status, providerLabel), status, provider));
      return;
    }

    processChunk(true);
    complete();
  };

  xhr.onerror = () => {
    if (aborted) {
      return;
    }
    fail(new ApiError("网络连接失败，请检查网络", undefined, provider));
  };

  xhr.ontimeout = () => {
    fail(new ApiError("请求超时", undefined, provider));
  };

  xhr.onabort = () => {
    clearSilence();
  };

  resetSilence();
  xhr.send(body);

  return {
    abort: () => {
      aborted = true;
      finished = true;
      clearSilence();
      xhr.abort();
    },
  };
}

export function streamSiliconFlowKimi(
  imageBase64: string,
  model: string,
  apiKey: string,
  mode: "general" | "circuit",
  onContent: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void
): CancelFn {
  if (!apiKey.trim()) {
    onError(new ApiError("请先在设置中配置硅基流动 API Key", undefined, "siliconflow"));
    return () => {};
  }

  const promptText =
    mode === "circuit"
      ? [
          "请识别这张图片，并按以下要求输出。",
          "第一步：判断图片类型。",
          "  - 如果图片是电路图/电路题（包含电路符号、元件、连线、节点等），则 isCircuit 设为 true。",
          "  - 如果图片是数学题、文字题或其他非电路内容（如微积分、线性代数、概率论、物理公式等），则 isCircuit 设为 false。",
          "第二步：如果是电路图，用自然语言描述电路结构、节点、元件和连接关系。",
          "  如果是非电路内容，提取并整理图中的题目文字、公式、要求等，尽量保持原意。",
          "第三步：必须输出一个 ```json 代码块，内容如下：",
          "",
          "如果是电路图（isCircuit 为 true）：",
          "{",
          '  "isCircuit": true,',
          '  "nodes": [{ id, label, kind }],',
          '  "components": [{ id, name, kind, value, parameters, terminals, orientation }],',
          '  "connections": [{ componentId, terminalId, nodeId }],',
          '  "controls": [{ sourceComponentId, controlType, positiveNodeId, negativeNodeId, controllingComponentId }]',
          "}",
          "  - kind 可选：resistor, capacitor, inductor, voltage_source, current_source, ground, diode, bjt, mosfet, opamp, transformer, switch, probe, vcvs, vccs, ccvs, cccs, unknown。",
          "  - terminals 要写出端子名称；多端器件和受控源必须保留完整端子和控制关系。",
          "  - orientation 字段：horizontal（水平）/ vertical（垂直）/ auto（不确定）。",
          "  - 注意：电压源/电流源在原图中如果是竖着画的，orientation 必须填 vertical。",
          "",
          "如果是非电路内容（isCircuit 为 false）：",
          "{",
          '  "isCircuit": false,',
          '  "extractedText": "这里是提取整理后的题目内容..."',
          "}",
          "  - extractedText 要完整包含图中的公式、条件、求解目标。公式用 LaTeX 格式。",
          "",
          "如果布局信息难以准确识别，可以不输出 layout。",
        ].join("\n")
      : "请详细描述这张图片中的数学题或电路图的所有细节。请勿遗漏任何可见信息。";

  let collected = "";

  return startXhrStream(
    `${SILICONFLOW_BASE}/chat/completions`,
    {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        },
      ],
      stream: true,
      max_tokens: 4096,
    }),
    {
      provider: "siliconflow",
      silenceTimeoutMs: DEFAULT_SILENCE_TIMEOUT,
      onData: (raw) => {
        try {
          const parsed = JSON.parse(raw);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            collected += delta;
            onContent(collected);
          }
        } catch {
          // skip malformed chunks
        }
      },
      onDone,
      onError,
    }
  ).abort;
}

export function streamDeepSeek(
  problemText: string,
  model: string,
  apiKey: string,
  onReasoning: (text: string) => void,
  onContent: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void
): CancelFn {
  if (!apiKey.trim()) {
    onError(new ApiError("请先在设置中配置 DeepSeek API Key", undefined, "deepseek"));
    return () => {};
  }

  let reasoning = "";
  let content = "";

  return startXhrStream(
    `${DEEPSEEK_BASE}/chat/completions`,
    {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "你是一个高等数学和电路分析专家。请仔细解答用户的问题，优先使用结构化电路数据进行分析，并给出详细的解题步骤和最终答案。对于数学题，请使用 LaTeX 格式（$...$ 行内公式，$$...$$ 独立公式）展示公式。对于电路题，请明确说明采用的等效模型、节点/网孔关系、受控源处理方式和最终结论。在给出最终答案前，请先进行逐步推理。",
        },
        { role: "user", content: problemText },
      ],
      stream: true,
      reasoning_effort: "high",
      thinking: { type: "enabled" },
      max_tokens: 8192,
    }),
    {
      provider: "deepseek",
      disableSilenceTimeout: true,
      onData: (raw) => {
        try {
          const parsed = JSON.parse(raw);
          const delta = parsed.choices?.[0]?.delta;
          if (typeof delta?.reasoning_content === "string" && delta.reasoning_content) {
            reasoning += delta.reasoning_content;
            onReasoning(reasoning);
          }
          if (typeof delta?.content === "string" && delta.content) {
            content += delta.content;
            onContent(content);
          }
        } catch {
          // skip malformed chunks
        }
      },
      onDone,
      onError,
    }
  ).abort;
}
