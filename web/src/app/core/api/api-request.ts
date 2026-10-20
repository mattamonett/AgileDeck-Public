import { ErrorResponseSchema } from '@poker/shared';

/** The API's own error message from a response body, when it sent one. */
export function apiErrorMessage(body: unknown): string | null {
  const parsed = ErrorResponseSchema.safeParse(body);
  return parsed.success ? parsed.data.message : null;
}

/**
 * Reads a JSON response body and throws the API's error message, or the fallback, when the
 * response is not ok.
 */
export async function readJsonResponse(response: Response, fallback: string): Promise<unknown> {
  const data: unknown = await response.json();
  if (!response.ok) throw new Error(apiErrorMessage(data) ?? fallback);
  return data;
}
