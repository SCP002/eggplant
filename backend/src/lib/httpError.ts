export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    public readonly params?: Record<string, string | number>,
  ) {
    super(code)
    this.name = "HttpError"
  }
}

export function httpError(
  statusCode: number,
  code: string,
  params?: Record<string, string | number>,
): HttpError {
  return new HttpError(statusCode, code, params)
}
