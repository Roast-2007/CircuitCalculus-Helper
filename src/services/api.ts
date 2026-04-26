/** If no data received for this long, abort */
const DEFAULT_SILENCE_TIMEOUT = 120_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly provider?: string,
    public readonly recoverable: boolean = false
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
  provider: string;
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
            provider,
            true
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
  xhr.setRequestHeader("Connection", "keep-alive");
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
      const bodyMessage = parseErrorBody(xhr.responseText);
      fail(new ApiError(bodyMessage || getErrorMessage(status, provider), status, provider));
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

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function streamVisualRecognition(
  imageBase64: string,
  model: string,
  apiKey: string,
  baseUrl: string,
  mode: "general" | "circuit",
  onContent: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
  onReconnecting?: () => void
): CancelFn {
  if (!apiKey.trim()) {
    onError(new ApiError("请先在设置中配置视觉识别 API Key", undefined, baseUrl));
    return () => {};
  }

  const systemPrompt =
    mode === "circuit"
      ? [
          "你是一位资深电路工程师和题目分析专家。请识别图片并输出结构化结果。",
          "",
          "【识别流程】",
          "1. 判断图片类型：",
          "   - 若包含电路符号、元件、连线、节点 → isCircuit = true",
          "   - 若为数学题、文字题、公式等非电路内容 → isCircuit = false",
          "2. 详细描述电路结构、节点、元件和连接关系；非电路内容则提取题目文字和公式。",
          "3. 输出一个 ```json 代码块（格式见下方）。",
          "",
          "【分析原则】",
          "- 对于复杂电路，请逐个元件、逐个节点地扫描和记录，不遗漏任何可见元素。",
          "- 相信你的第一次判断，不要反复质疑或修正。以你最初看到的电路结构为准。",
          "- 对于不确定方向的元件，根据电路图中实际绘制方向推断；无法确定时填写 orientation: \"auto\"。",
          "- 电压源/电流源若竖着画，orientation 必须填 \"vertical\"。",
          "- 受控源（vcvs / vccs / ccvs / cccs）必须保留完整端子和控制关系，不能省略。",
          "",
          "【JSON 格式 —— 电路图（isCircuit: true）】",
          "{",
          '  "isCircuit": true,',
          '  "extractedText": "图中除电路图外的题干文字、公式、条件和求解目标（LaTeX数学公式使用$...$括起来）",',
          '  "nodes": [{ id, label, kind }],',
          '  "components": [{ id, name, kind, value, parameters, terminals, orientation }],',
          '  "connections": [{ componentId, terminalId, nodeId }],',
          '  "controls": [{ sourceComponentId, controlType, positiveNodeId, negativeNodeId, controllingComponentId }],',
          '  "quantities": [{ id, symbol, type, description, startNodeId, endNodeId, componentId, isControlQuantity, controllingComponentId, expression }]',
          "}",
          "  kind 可选：resistor, capacitor, inductor, voltage_source, current_source, ground, diode, bjt, mosfet, opamp, transformer, switch, probe, vcvs, vccs, ccvs, cccs, unknown。",
          "",
          "【电路量识别（quantities）】",
          "如果电路图上标注了待求物理量（如 I、I1、I2、3I1、V、Vout 等），请识别并输出 quantities 数组。",
          "命名规则：",
          "- 优先使用图上已有的变量名（如 I1、Vout）。若图上无命名，按以下规则：",
          "- 电流命名：I_起始节点_终止节点（如 I_N1_N2 表示从 N1 到 N2 的支路电流），禁止跨越中间节点命名。",
          "- 电压命名：V_起始节点_终止节点（如 V_N1_N2 表示 N1 与 N2 之间的电压），可跨节点。",
          "- 节点若无名称，用自然语言描述位置（如\"电压源正极节点\"、\"中央上方节点\"）。",
          "- 方向始终从 startNodeId 指向 endNodeId。",
          "- 控制量（如 3I1）：symbol 填\"3I1\"，expression 填\"3*I1\"，isControlQuantity 设为 true。",
          "描述要求：用完整自然语言描述每个量，明确所在支路、关联节点和方向，例如\"流过电阻R1所在支路的电流I1，方向从节点N1指向节点N2\"。",
          "",
          "quantities 项格式：",
          "{",
          '  "id": "q1",',
          '  "symbol": "I1",',
          '  "type": "current" | "voltage" | "power" | "other",',
          '  "description": "流过电阻R1所在支路的电流I1，方向从节点N1指向节点N2",',
          '  "startNodeId": "N1",',
          '  "endNodeId": "N2",',
          '  "componentId": "R1",',
          '  "isControlQuantity": false,',
          '  "controllingComponentId": null,',
          '  "expression": null',
          "}",
          "",
          "【JSON 格式 —— 非电路内容（isCircuit: false）】",
          "{",
          '  "isCircuit": false,',
          '  "extractedText": "提取整理后的题目内容..."',
          "}",
          "  extractedText 要完整包含公式（LaTeX 格式）、条件、求解目标。",
        ].join("\n")
      : "请详细描述这张图片中的数学题或电路图的所有细节。请勿遗漏任何可见信息。";

  const MAX_RETRIES = 3;
  const BACKOFF_MS = [1000, 2000, 4000];
  const SILENCE_TIMEOUT_VISUAL = 30_000;

  let collected = "";
  let retryCount = 0;
  let currentAbort: ReturnType<typeof startXhrStream> | null = null;
  let backoffTimer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  function cleanUp(): void {
    if (currentAbort) {
      currentAbort.abort();
      currentAbort = null;
    }
    if (backoffTimer) {
      clearTimeout(backoffTimer);
      backoffTimer = null;
    }
  }

  function tryStream(): void {
    const messages: Array<{ role: string; content: unknown }> = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "请识别这张图片。" },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ],
      },
    ];

    if (collected) {
      messages.push({ role: "assistant", content: collected });
      messages.push({ role: "user", content: "Please continue." });
    }

    currentAbort = startXhrStream(
      `${normalizeBaseUrl(baseUrl)}/chat/completions`,
      {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: 16384,
      }),
      {
        provider: baseUrl,
        disableSilenceTimeout: false,
        silenceTimeoutMs: SILENCE_TIMEOUT_VISUAL,
        onData: (raw) => {
          try {
            const parsed = JSON.parse(raw);
            const delta = parsed.choices?.[0]?.delta;
            if (typeof delta?.content === "string") {
              collected += delta.content;
              onContent(collected);
            }
          } catch {
            // skip malformed chunks
          }
        },
        onDone: () => {
          cleanUp();
          onDone();
        },
        onError: (err: Error) => {
          handleStreamError(err);
        },
      }
    );
  }

  function handleStreamError(err: Error): void {
    if (cancelled) return;

    if (err instanceof ApiError && err.recoverable && retryCount < MAX_RETRIES) {
      retryCount++;
      onReconnecting?.();
      const delay = BACKOFF_MS[retryCount - 1];
      backoffTimer = setTimeout(() => {
        backoffTimer = null;
        if (!cancelled) {
          tryStream();
        }
      }, delay);
      return;
    }

    cleanUp();
    onError(err);
  }

  tryStream();
  return () => {
    cancelled = true;
    cleanUp();
  };
}

export function streamReasoning(
  problemText: string,
  model: string,
  apiKey: string,
  baseUrl: string,
  onReasoning: (text: string) => void,
  onContent: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
  onReconnecting?: () => void
): CancelFn {
  if (!apiKey.trim()) {
    onError(new ApiError("请先在设置中配置推理模型 API Key", undefined, baseUrl));
    return () => {};
  }

  const SYSTEM_PROMPT =
    "你是高等数学与电路分析领域的专家。解答用户问题时，请遵循以下原则：\n" +
    "1. 逐步推理，条理清晰，每步有明确结论。\n" +
    "2. 若提供了结构化电路数据，优先基于节点/网孔、等效模型、受控源关系进行分析。\n" +
    "3. 若提供了电路量描述（quantities），请理解其命名规则：\n" +
    "   - I_起始节点_终止节点：从起始节点流向结束节点的支路电流，路径不跨越中间节点。\n" +
    "   - V_起始节点_终止节点：两节点间电压，可跨节点，方向从起始节点指向结束节点。\n" +
    "   - 形如 3I1 的控制量表达式：表示 3×I1 的值，关注其与受控源的控制关系。\n" +
    "   - 自然语言描述中会指明量所属的支路/元件和方向。\n" +
    "4. 相信自己的判断，遇到复杂问题时逐个拆解，不反复推翻已有结论。\n" +
    "5. 数学题使用 LaTeX 格式（$...$ 行内公式，$$...$$ 独立公式）展示公式。\n" +
    "6. 最终答案明确给出，推理过程在前、结论在后。";

  const MAX_RETRIES = 3;
  const BACKOFF_MS = [1000, 2000, 4000];
  const SILENCE_TIMEOUT_REASONING = 60_000;

  let reasoning = "";
  let content = "";
  let retryCount = 0;
  let currentAbort: ReturnType<typeof startXhrStream> | null = null;
  let backoffTimer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  function cleanUp(): void {
    if (currentAbort) {
      currentAbort.abort();
      currentAbort = null;
    }
    if (backoffTimer) {
      clearTimeout(backoffTimer);
      backoffTimer = null;
    }
  }

  function tryStream(): void {
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: problemText },
    ];

    const accumulated = [reasoning, content].filter(Boolean).join("\n");
    if (accumulated) {
      messages.push({ role: "assistant", content: accumulated });
      messages.push({ role: "user", content: "Please continue." });
    }

    currentAbort = startXhrStream(
      `${normalizeBaseUrl(baseUrl)}/chat/completions`,
      {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      JSON.stringify({
        model,
        messages,
        stream: true,
        reasoning_effort: "high",
        thinking: { type: "enabled" },
        max_tokens: 65536,
      }),
      {
        provider: baseUrl,
        disableSilenceTimeout: false,
        silenceTimeoutMs: SILENCE_TIMEOUT_REASONING,
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
        onDone: () => {
          cleanUp();
          onDone();
        },
        onError: (err: Error) => {
          handleStreamError(err);
        },
      }
    );
  }

  function handleStreamError(err: Error): void {
    if (cancelled) return;

    if (err instanceof ApiError && err.recoverable && retryCount < MAX_RETRIES) {
      retryCount++;
      onReconnecting?.();
      const delay = BACKOFF_MS[retryCount - 1];
      backoffTimer = setTimeout(() => {
        backoffTimer = null;
        if (!cancelled) {
          tryStream();
        }
      }, delay);
      return;
    }

    cleanUp();
    onError(err);
  }

  tryStream();
  return () => {
    cancelled = true;
    cleanUp();
  };
}

export async function testApiConnection(
  baseUrl: string,
  apiKey: string,
  model: string,
  providerLabel: string
): Promise<{ success: boolean; message: string }> {
  if (!apiKey.trim()) {
    return { success: false, message: "API Key 不能为空" };
  }

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const url = `${normalizeBaseUrl(baseUrl)}/chat/completions`;

    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${apiKey.trim()}`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.timeout = 10_000;

    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve({ success: true, message: `${providerLabel} 连接正常` });
      } else if (xhr.status === 401 || xhr.status === 403) {
        resolve({ success: false, message: "API Key 无效或已过期" });
      } else {
        const bodyMsg = parseErrorBody(xhr.responseText);
        resolve({
          success: false,
          message: bodyMsg || getErrorMessage(xhr.status, providerLabel),
        });
      }
    };

    xhr.onerror = () => resolve({ success: false, message: "网络连接失败，请检查网络" });
    xhr.ontimeout = () => resolve({ success: false, message: "请求超时" });

    xhr.send(
      JSON.stringify({
        model,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1,
      })
    );
  });
}
