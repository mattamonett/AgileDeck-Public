import type { Response } from 'express';

/** A typed value one middleware stores for later handlers of the same request. */
export interface ResponseLocal<T> {
  set(res: Response, value: T): void;
  /** Throws `missing()` when no earlier middleware stored the value. */
  get(res: Response): T;
}

export function responseLocal<T>(missing: () => Error): ResponseLocal<T> {
  const slots = new WeakMap<Response, { readonly value: T }>();
  return {
    set(res, value) {
      slots.set(res, { value });
    },
    get(res) {
      const slot = slots.get(res);
      if (!slot) throw missing();
      return slot.value;
    },
  };
}
