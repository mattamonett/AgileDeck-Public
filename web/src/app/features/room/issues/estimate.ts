export type EstimateField = Pick<HTMLInputElement, 'value' | 'valueAsNumber' | 'checkValidity'>;

export type ParsedEstimate =
  { readonly valid: true; readonly estimate: number | null } | { readonly valid: false };

/** Reads a number input as an issue estimate: empty clears it, anything unusable is invalid. */
export function parseEstimate(input: EstimateField): ParsedEstimate {
  if (!input.checkValidity()) return { valid: false };
  if (input.value === '') return { valid: true, estimate: null };
  const estimate = input.valueAsNumber;
  return Number.isFinite(estimate) ? { valid: true, estimate } : { valid: false };
}
