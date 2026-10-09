/**
 * HTTP 边界契约。
 *
 * 规格：08-DATA_API_SPEC.md §5
 *
 * ⚠️ 这个文件**不使用任何框架 API**（用标准的 `Response.json`，不是 `NextResponse`）。
 * 因为 `ApiError` 会被 `src/services/*` 抛出 —— 服务层不得依赖框架，
 * 将来把服务层挪到独立进程时，这些错误对象要能原样带过去。
 */

/** 错误码 → HTTP 状态（08 §5）。改这里必须同步文档。 */
export const ERROR_STATUS = {
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  RATE_LIMITED: 429,
  AI_UPSTREAM_FAILED: 502,
  DELETION_INCOMPLETE: 500,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    /** 附加信息（如删除失败的文件清单）。不是所有错误都有。 */
    detail?: unknown;
  };
}

/**
 * 可抛出的 API 错误。
 *
 * 服务层抛它，路由层捕获后渲染成响应 —— 这样服务层不需要知道 HTTP 的存在，
 * 只需要知道「这是哪种失败」。
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly detail?: unknown;

  constructor(code: ErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.detail = detail;
  }
}

/** 成功响应：`{ data, meta }`（08 §5）。 */
export function ok<T>(data: T, meta: Record<string, unknown> = {}): Response {
  return Response.json({ data, meta });
}

/** 201 —— 上传成功用（08 §6）。 */
export function created<T>(data: T, meta: Record<string, unknown> = {}): Response {
  return Response.json({ data, meta }, { status: 201 });
}

/** 错误响应：`{ error: { code, message, requestId } }`（08 §5）。 */
export function fail(
  code: ErrorCode,
  message: string,
  detail?: unknown,
): Response {
  const body: ErrorBody = {
    error: {
      code,
      message,
      requestId: crypto.randomUUID(),
      ...(detail === undefined ? {} : { detail }),
    },
  };
  return Response.json(body, { status: ERROR_STATUS[code] });
}

/**
 * 把任意抛出物收敛成错误响应。
 *
 * `ApiError` 按自身状态码渲染；其余一律 500，并且**不把原始错误信息回给客户端**
 * —— 那可能带上文件路径或上游响应片段（12 §10）。服务端日志只记 code 与类型。
 */
export function failFrom(error: unknown, context: string): Response {
  if (error instanceof ApiError) {
    return fail(error.code, error.message, error.detail);
  }

  console.error(`[${context}] 未预期的失败`, error);
  return fail("INTERNAL", "服务端出错了");
}
