/**
 * Framework-free error type. Route handlers turn this into the `{ error: {...} }`
 * envelope via `apiError()`; library code can throw it without importing
 * anything from `next/*`.
 */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiFail(code: string, message: string, status = 400): never {
  throw new ApiError(code, message, status);
}
