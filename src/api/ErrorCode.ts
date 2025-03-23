export class APIError extends Error {
  constructor(
    readonly code: string,
    override readonly message: string,
    extra?: Record<string, unknown>,
  ) {
    super(message);
    // Object.defineProperty(this, "message", { enumerable: false });
    if (extra) Object.assign(this, extra);
    // this.extensions.code = code;
    // if (extra) Object.assign(this.extensions, extra);
  }
}
