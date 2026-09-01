import { describe, it, expect } from 'vitest';
import { parseSurfacePoints } from '../surfacePointText';

describe('parseSurfacePoints', () => {
  it('reads comma-separated E, N, RL', () => {
    const { pts, rejected } = parseSurfacePoints('254800.00, 2605200.00, 112.50');
    expect(pts).toEqual([{ x: 254800, y: 2605200, z: 112.5 }]);
    expect(rejected).toHaveLength(0);
  });

  it.each([
    ['tabs', '254800\t2605200\t112.5'],
    ['spaces', '254800 2605200 112.5'],
    ['semicolons', '254800; 2605200; 112.5'],
    ['mixed separators', '254800 ,\t2605200 ; 112.5']
  ])('reads %s', (_label, line) => {
    expect(parseSurfacePoints(line).pts).toEqual([{ x: 254800, y: 2605200, z: 112.5 }]);
  });

  it('reads negative heights and coordinates', () => {
    expect(parseSurfacePoints('-120.5, -3000.25, -8.75').pts).toEqual([
      { x: -120.5, y: -3000.25, z: -8.75 }
    ]);
  });

  it('skips blank lines and comments', () => {
    const text = ['# pickup 12/03', '', '1000, 2000, 10', '   ', '# end'].join('\n');
    const { pts, rejected } = parseSurfacePoints(text);
    expect(pts).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it('drops an unambiguous leading point label', () => {
    // "STK1" cannot be a coordinate, so treating it as a label is not a guess.
    expect(parseSurfacePoints('STK1, 254800, 2605200, 112.5').pts).toEqual([
      { x: 254800, y: 2605200, z: 112.5 }
    ]);
  });

  it('keeps a trailing feature code', () => {
    expect(parseSurfacePoints('254800, 2605200, 112.5, TOE').pts).toEqual([
      { x: 254800, y: 2605200, z: 112.5 }
    ]);
  });

  it('refuses four numbers rather than guessing which three are the point', () => {
    // "1, 254800, 2605200, 112.5" could be a point number then E, N, RL, or
    // E, N, RL then a numeric code. Reading it either way would put the wrong
    // value in an easting and still produce a plausible-looking volume.
    const { pts, rejected } = parseSurfacePoints('1, 254800, 2605200, 112.5');
    expect(pts).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatch(/only E, N, RL/);
  });

  it('refuses a line with only two numbers', () => {
    const { pts, rejected } = parseSurfacePoints('254800, 2605200');
    expect(pts).toHaveLength(0);
    expect(rejected[0]).toMatch(/three numbers/);
  });

  it('refuses a non-numeric height instead of reading it as zero', () => {
    // A height silently defaulted to 0 is the difference between a stockpile
    // and a hole.
    const { pts, rejected } = parseSurfacePoints('254800, 2605200, n/a');
    expect(pts).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });

  it('quotes the offending line back so it can be found and fixed', () => {
    const { rejected } = parseSurfacePoints('254800, oops, 112.5');
    expect(rejected[0]).toContain('254800, oops, 112.5');
  });

  it('keeps the good lines when some are bad', () => {
    const text = ['1000, 2000, 10', 'rubbish', '1010, 2000, 11'].join('\n');
    const { pts, rejected } = parseSurfacePoints(text);
    expect(pts).toHaveLength(2);
    expect(rejected).toHaveLength(1);
  });

  it('returns nothing for empty input rather than throwing', () => {
    expect(parseSurfacePoints('').pts).toHaveLength(0);
    expect(parseSurfacePoints('   \n\n  ').rejected).toHaveLength(0);
  });
});
