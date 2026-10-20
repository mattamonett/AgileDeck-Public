/** A request failure whose status and message are safe to show the caller. */
export class ClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
