/**
 * The object store, behind a port.
 *
 * Images are the one thing in this system that does not belong in Postgres, and
 * the one thing the frontend must still be able to render directly. A port
 * rather than a bare S3 client because the architecture's phase 3 swaps
 * implementations and not columns: tests bind an in-memory fake here, and
 * moving off Supabase Storage later is one provider, not a grep.
 */

/** Injection token for the object store (di-use-interfaces-tokens). */
export const STORAGE = Symbol('STORAGE');

export interface StoragePort {
  /**
   * Writes an object. `kljuc` is server-generated and already namespaced; the
   * implementation must not derive any part of it from client input.
   */
  put(kljuc: string, telo: Buffer, mimeTip: string): Promise<void>;

  /** Best-effort removal. A missing object is not an error — the caller's row is already gone. */
  remove(kljuc: string): Promise<void>;

  /**
   * The public address of an object. Pure and synchronous: it is string
   * construction, not a request, which is why a caller may store the result.
   */
  url(kljuc: string): string;
}
