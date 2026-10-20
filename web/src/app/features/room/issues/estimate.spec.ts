import { parseEstimate, type EstimateField } from './estimate';

function field(value: string, valid = true): EstimateField {
  return { value, valueAsNumber: value === '' ? NaN : Number(value), checkValidity: () => valid };
}

describe('parseEstimate', () => {
  it('clears the estimate when the field is empty', () => {
    expect(parseEstimate(field(''))).toEqual({ valid: true, estimate: null });
  });

  it('reads finite numbers, including zero and decimals', () => {
    expect(parseEstimate(field('0'))).toEqual({ valid: true, estimate: 0 });
    expect(parseEstimate(field('2.5'))).toEqual({ valid: true, estimate: 2.5 });
  });

  it('rejects fields the browser marks invalid', () => {
    expect(parseEstimate(field('5', false))).toEqual({ valid: false });
  });

  it('rejects values that are not finite numbers', () => {
    expect(parseEstimate(field('Infinity'))).toEqual({ valid: false });
    expect(parseEstimate({ value: 'x', valueAsNumber: NaN, checkValidity: () => true })).toEqual({
      valid: false,
    });
  });
});
