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
  onReasoning: (text: string) => void,
  onContent: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void
): CancelFn {
  if (!apiKey.trim()) {
    onError(new ApiError("请先在设置中配置硅基流动 API Key", undefined, "siliconflow"));
    return () => {};
  }

  const systemPrompt =
    mode === "circuit"
      ? [
          "请识别图片，严格按以下步骤操作。",
          "第一步：判断图片类型。",
          "  - 如果是电路图/电路题（包含电路符号、元件、连线、节点等），则 isCircuit 设为 true。",
          "  - 否则 isCircuit 设为 false。",
          "第二步：如果是电路图，用自然语言描述电路结构、节点、元件和连接关系。",
          "  如果是非电路内容，提取并整理图中的题目文字、公式、要求等。",
          "第三步：必须输出一个 ```json 代码块，内容如下：",
          "",
          "电路图（isCircuit: true）：",
          "{",
          '  "isCircuit": true,',
          '  "nodes": [{ id, label, kind }],',
          '  "components": [{ id, name, kind, value, parameters, terminals, orientation }],',
          '  "connections": [{ componentId, terminalId, nodeId }],',
          '  "controls": [{ sourceComponentId, controlType, positiveNodeId, negativeNodeId, controllingComponentId }]',
          "}",
          "  kind 可选：resistor, capacitor, inductor, voltage_source, current_source, ground, diode, bjt, mosfet, opamp, transformer, switch, probe, vcvs, vccs, ccvs, cccs, unknown。",
          "  terminals 必须写出端子名称；多端器件和受控源必须保留完整端子和控制关系。",
          "  orientation：horizontal（水平）/ vertical（垂直）/ auto（不确定）。",
          "  电压源/电流源若竖着画，orientation 必须填 vertical。",
          "",
          "非电路内容（isCircuit: false）：",
          "{",
          '  "isCircuit": false,',
          '  "extractedText": "提取整理后的题目内容..."',
          "}",
          "  extractedText 要完整包含公式（LaTeX 格式）、条件、求解目标。",
        ].join("\n")
      : "请详细描述这张图片中的数学题或电路图的所有细节。请勿遗漏任何可见信息。";

  let reasoning = "";
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
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "请识别这张图片。" },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        },
      ],
      stream: true,
      thinking: { type: "enabled" },
      max_tokens: 8192,
    }),
    {
      provider: "siliconflow",
      disableSilenceTimeout: true,
      onData: (raw) => {
        try {
          const parsed = JSON.parse(raw);
          const delta = parsed.choices?.[0]?.delta;
          if (typeof delta?.reasoning_content === "string") {
            reasoning += delta.reasoning_content;
            onReasoning(reasoning);
          }
          if (typeof delta?.content === "string") {
            collected += delta.content;
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
          if (typeof delta?.reasoning_content === "string") {
            reasoning += delta.reasoning_content;
            onReasoning(reasoning);
          }
          if (typeof delta?.content === "string") {
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
