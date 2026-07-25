import { ApiError } from '@/lib/api';

/** What every Server Action hands back: a value, or a message a form can show. */
export type ActionResult<T = void> =
  | { error: string; value?: undefined }
  | { error?: undefined; value: T };

const UNREACHABLE = 'Could not reach Atlas. Is the backend running?';

/**
 * Runs a mutation and turns a backend refusal into state instead of an exception —
 * `ApiError.message` is the backend's own `detail`, which explains quota failures.
 * Never redirect inside `mutate`: the redirect signal would be caught here.
 */
export async function attempt<T>(mutate: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { value: await mutate() };
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : UNREACHABLE };
  }
}
