/**
 * Describes why an AI answer came from the local engine rather than the server.
 *
 * Both AI surfaces fall back to the in-browser geomatics engine when the call to
 * this application's own endpoint fails, and both did so silently. That is good
 * behaviour with a bad ending: the user still gets an answer, so nothing looks
 * wrong, and a deployment where the endpoints did not exist at all went
 * unnoticed. Falling back because no API key is configured and falling back
 * because the service is unreachable are different situations, and only one of
 * them is a fault someone should fix.
 */
export function describeAiFallback(status: number | null, error?: unknown): string {
  if (status === 404) {
    return 'Answered by the local engine: the assistant service is not deployed at this address (404). The hosted model is unavailable until it is.';
  }
  if (status === 429) {
    return 'Answered by the local engine: the assistant service is rate limiting this client (429). Try again shortly.';
  }
  if (status === 401 || status === 403) {
    return `Answered by the local engine: the assistant service refused this request (${status}).`;
  }
  if (status === 413) {
    return 'Answered by the local engine: the request was larger than the service accepts (413).';
  }
  if (status != null) {
    return `Answered by the local engine: the assistant service returned ${status}.`;
  }
  const reason = error instanceof Error && error.message ? ` (${error.message})` : '';
  return `Answered by the local engine: the assistant service could not be reached${reason}.`;
}
