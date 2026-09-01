import { describe, it, expect } from 'vitest';
import { resolveImportedZone } from '../StorageService';
import { crsLabelFor, DEFAULT_ZONE } from '../../lib/crsIdentity';

describe('resolveImportedZone', () => {
  it('takes the declared working zone when it is usable', () => {
    const issues: string[] = [];
    expect(resolveImportedZone('43N', 'WGS 84 / UTM Zone 43N (EPSG:32643)', issues)).toBe('43N');
    expect(issues).toHaveLength(0);
  });

  it('keeps a southern zone southern', () => {
    // The whole point: a southern project must not come back labelled north.
    const issues: string[] = [];
    const zone = resolveImportedZone('30S', null, issues);
    expect(zone).toBe('30S');
    expect(crsLabelFor(zone)).toContain('EPSG:32730');
    expect(crsLabelFor(zone)).not.toContain('32630');
  });

  it('does not invent zone 45N for a package that states 30S and no CRS string', () => {
    // The old code fell back to the literal "WGS 84 / UTM Zone 45N" for the
    // label while keeping workingZone 30S, so every calculation ran in the
    // southern hemisphere under a northern name.
    const issues: string[] = [];
    const zone = resolveImportedZone('30S', undefined, issues);
    expect(crsLabelFor(zone)).toBe('WGS 84 / UTM Zone 30S (EPSG:32730)');
  });

  it('normalises a zone written without a hemisphere letter to north', () => {
    expect(resolveImportedZone('43', null, [])).toBe('43N');
  });

  it('normalises lower case', () => {
    expect(resolveImportedZone('43s', null, [])).toBe('43S');
  });

  it('recovers the zone from the CRS label when no working zone is recorded', () => {
    const issues: string[] = [];
    expect(resolveImportedZone(null, 'WGS 84 / UTM Zone 46N (EPSG:32646)', issues)).toBe('46N');
    expect(issues.join(' ')).toMatch(/taken from the package's CRS label/i);
  });

  it('recovers a southern zone from the CRS label', () => {
    expect(resolveImportedZone(undefined, 'WGS 84 / UTM Zone 23S (EPSG:32723)', [])).toBe('23S');
  });

  it('keeps the working zone when the label disagrees, and says so', () => {
    // The coordinates were computed on the working zone; the label is only
    // ever displayed. Silently trusting the label would relocate the project.
    const issues: string[] = [];
    const zone = resolveImportedZone('43N', 'WGS 84 / UTM Zone 45N (EPSG:32645)', issues);
    expect(zone).toBe('43N');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/names zone 45N/);
    expect(issues[0]).toMatch(/working zone is 43N/);
  });

  it('flags a hemisphere disagreement, not just a zone-number one', () => {
    const issues: string[] = [];
    expect(resolveImportedZone('30S', 'WGS 84 / UTM Zone 30N (EPSG:32630)', issues)).toBe('30S');
    expect(issues[0]).toMatch(/names zone 30N/);
  });

  it('falls back to the default zone only when nothing usable is stated, and says so loudly', () => {
    const issues: string[] = [];
    expect(resolveImportedZone(null, null, issues)).toBe(DEFAULT_ZONE);
    expect(issues[0]).toMatch(/does not state a usable UTM zone/i);
    expect(issues[0]).toMatch(/before relying on any measurement/i);
  });

  it.each([
    ['an out-of-range zone number', '61N'],
    ['zero', '0N'],
    ['prose', 'somewhere in India'],
    ['an empty string', '']
  ])('treats %s as no zone at all rather than parsing part of it', (_label, bad) => {
    const issues: string[] = [];
    expect(resolveImportedZone(bad, null, issues)).toBe(DEFAULT_ZONE);
    expect(issues[0]).toMatch(/does not state a usable UTM zone/i);
  });

  it('ignores a CRS label that names no zone', () => {
    const issues: string[] = [];
    // The old "Universal UTM Grid" label named neither zone nor EPSG code.
    expect(resolveImportedZone('44N', 'WGS 84 / UTM Global Grid', issues)).toBe('44N');
    expect(issues).toHaveLength(0);
  });

  it('ignores a geographic CRS label rather than reading a zone out of it', () => {
    const issues: string[] = [];
    expect(resolveImportedZone('44N', 'WGS 84 Geographic 2D (EPSG:4326)', issues)).toBe('44N');
    expect(issues).toHaveLength(0);
  });

  it('always returns a zone that produces a valid label', () => {
    for (const input of ['1N', '60S', '31S', 'nonsense', null, undefined, '99N']) {
      const zone = resolveImportedZone(input as any, null, []);
      expect(crsLabelFor(zone)).toMatch(/^WGS 84 \/ UTM Zone \d{1,2}[NS] \(EPSG:32[67]\d\d\)$/);
    }
  });
});
