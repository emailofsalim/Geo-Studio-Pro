import { describe, it, expect } from 'vitest';
import { guardAiFeatures, MAX_AI_FEATURES, MAX_AI_POINTS_PER_FEATURE } from '../aiFeatureGuard';

const validPoint = { name: 'P1', geom: 'point', kind: 'll', pts: [{ a: 85.0, b: 23.5 }] };
const validPolygon = {
  name: 'Block',
  geom: 'polygon',
  kind: 'en',
  pts: [
    { a: 255000, b: 2605000 },
    { a: 255100, b: 2605000 },
    { a: 255100, b: 2605100 }
  ]
};

describe('AI feature guard — accepts sound geometry', () => {
  it('accepts a well-formed point and polygon', () => {
    const r = guardAiFeatures([validPoint, validPolygon]);
    expect(r.features).toHaveLength(2);
    expect(r.rejected).toBe(0);
  });

  it('accepts the {features: [...]} wrapper a model may return', () => {
    expect(guardAiFeatures({ features: [validPoint] }).features).toHaveLength(1);
  });

  it('accepts a single bare feature', () => {
    expect(guardAiFeatures(validPoint).features).toHaveLength(1);
  });

  it('reports an unrecognised shape rather than throwing', () => {
    const r = guardAiFeatures('just some prose');
    expect(r.features).toHaveLength(0);
    expect(r.reasons.join(' ')).toMatch(/recognised shape/i);
  });
});

describe('AI feature guard — rejects what would corrupt a survey', () => {
  it('rejects a feature that does not declare its coordinate frame', () => {
    // Assuming the frame is how coordinates end up in the wrong hemisphere.
    const r = guardAiFeatures([{ ...validPoint, kind: undefined }]);
    expect(r.features).toHaveLength(0);
    expect(r.reasons.join(' ')).toMatch(/geographic or projected/i);
  });

  it('rejects an unknown geometry type', () => {
    const r = guardAiFeatures([{ ...validPoint, geom: 'hyperplane' }]);
    expect(r.features).toHaveLength(0);
    expect(r.reasons.join(' ')).toMatch(/geometry type/i);
  });

  it.each([
    ['a string coordinate', [{ a: '85.0', b: 23.5 }]],
    ['NaN', [{ a: NaN, b: 23.5 }]],
    ['Infinity', [{ a: Infinity, b: 23.5 }]],
    ['a null point', [null]],
    ['a missing axis', [{ a: 85.0 }]]
  ])('rejects %s', (_label, pts) => {
    expect(guardAiFeatures([{ ...validPoint, pts }]).features).toHaveLength(0);
  });

  it('rejects geographic coordinates outside lon/lat range', () => {
    expect(guardAiFeatures([{ ...validPoint, pts: [{ a: 400, b: 23.5 }] }]).features).toHaveLength(0);
    expect(guardAiFeatures([{ ...validPoint, pts: [{ a: 85, b: 120 }] }]).features).toHaveLength(0);
  });

  it('rejects projected coordinates no UTM grid could express', () => {
    const r = guardAiFeatures([{ ...validPolygon, pts: [{ a: 9e9, b: 2605000 }, { a: 1, b: 2 }, { a: 3, b: 4 }] }]);
    expect(r.features).toHaveLength(0);
  });

  it('rejects a polygon with too few points to be one', () => {
    const r = guardAiFeatures([{ ...validPolygon, pts: [{ a: 255000, b: 2605000 }] }]);
    expect(r.features).toHaveLength(0);
    expect(r.reasons.join(' ')).toMatch(/too few points/i);
  });

  it('rejects a line with a single point', () => {
    expect(guardAiFeatures([{ ...validPoint, geom: 'line' }]).features).toHaveLength(0);
  });

  it('keeps the good features and drops only the bad ones', () => {
    const r = guardAiFeatures([validPoint, { geom: 'point' }, validPolygon, { nonsense: true }]);
    expect(r.features).toHaveLength(2);
    expect(r.rejected).toBe(2);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('never repairs a bad feature into a plausible one', () => {
    // Silently "fixing" model output is how fabricated geometry reaches a
    // deliverable, so a broken feature is dropped, not corrected.
    const r = guardAiFeatures([{ name: 'X', geom: 'polygon', kind: 'en', pts: [{ a: 1, b: 2 }] }]);
    expect(r.features).toHaveLength(0);
  });
});

describe('AI feature guard — bounds', () => {
  it('caps the number of features accepted from one response', () => {
    const many = Array.from({ length: MAX_AI_FEATURES + 25 }, () => validPoint);
    const r = guardAiFeatures(many);
    expect(r.features).toHaveLength(MAX_AI_FEATURES);
    expect(r.rejected).toBe(25);
    expect(r.reasons.join(' ')).toMatch(new RegExp(`${MAX_AI_FEATURES}`));
  });

  it('rejects a feature with an implausible number of points', () => {
    const pts = Array.from({ length: MAX_AI_POINTS_PER_FEATURE + 1 }, () => ({ a: 85, b: 23 }));
    expect(guardAiFeatures([{ ...validPoint, geom: 'line', pts }]).features).toHaveLength(0);
  });
});

describe('AI feature guard — property sanitisation', () => {
  it('keeps primitive properties', () => {
    const r = guardAiFeatures([{ ...validPoint, props: { code: 'BP', depth: 12.5, checked: true } }]);
    expect(r.features[0].props).toEqual({ code: 'BP', depth: 12.5, checked: true });
  });

  it('drops nested objects and arrays that would end up in an export', () => {
    const r = guardAiFeatures([{ ...validPoint, props: { good: 'yes', nested: { a: 1 }, list: [1, 2] } }]);
    expect(r.features[0].props).toEqual({ good: 'yes' });
  });

  it('omits props entirely when nothing survives', () => {
    const r = guardAiFeatures([{ ...validPoint, props: { nested: { a: 1 } } }]);
    expect(r.features[0].props).toBeUndefined();
  });

  it('gives an unnamed feature a placeholder and truncates a huge name', () => {
    expect(guardAiFeatures([{ ...validPoint, name: undefined }]).features[0].name).toBe('AI feature');
    expect(guardAiFeatures([{ ...validPoint, name: 'x'.repeat(500) }]).features[0].name.length).toBe(120);
  });
});
