import { describe, it, expect } from 'vitest';
import {
  geoJsonBuild, geoJsonParse,
  kmlBuild, kmlParse,
  gpxBuild, gpxParse,
  wktBuild, wktParse
} from '../formats';
import type { GeoFeature } from '../../types';

// ---------------------------------------------------------------------------
// What survives a write and a read back
// ---------------------------------------------------------------------------
// The format table claims read and write for these four. A round trip is the
// test that matters: it catches what a one-way test cannot — coordinates losing
// precision in the text form, a ring silently opening or closing, a z value
// dropped by a writer that never declared it was 2D.
//
// Survey coordinates make the precision point concrete. A seventh decimal place
// of latitude is about 11 mm; rounding to five decimals moves a boundary by
// more than a metre, which is the difference between a plot fitting its
// neighbours and not.

const LON = 84.6012345;
const LAT = 23.5410987;

const point = (): GeoFeature =>
  ({ kind: 'll', geom: 'point', name: 'BM-1', pts: [{ a: LON, b: LAT }], props: {} } as unknown as GeoFeature);

const line = (): GeoFeature =>
  ({
    kind: 'll', geom: 'line', name: 'Traverse',
    pts: [{ a: LON, b: LAT }, { a: LON + 0.001, b: LAT + 0.001 }, { a: LON + 0.002, b: LAT }],
    props: {}
  } as unknown as GeoFeature);

const polygon = (): GeoFeature =>
  ({
    kind: 'll', geom: 'polygon', name: 'Khasra 41',
    pts: [
      { a: LON, b: LAT },
      { a: LON + 0.001, b: LAT },
      { a: LON + 0.001, b: LAT + 0.001 },
      { a: LON, b: LAT + 0.001 }
    ],
    props: {}
  } as unknown as GeoFeature);

/** Millimetre-level agreement: 1e-7 degrees is about 11 mm of latitude. */
const TOLERANCE_DEG = 1e-7;

const roundTrips: [string, (f: GeoFeature[]) => string, (t: string) => GeoFeature[]][] = [
  ['GeoJSON', f => geoJsonBuild(f), t => geoJsonParse(t)],
  ['KML', f => kmlBuild(f), t => kmlParse(t)],
  ['WKT', f => wktBuild(f), t => wktParse(t)]
];

describe.each(roundTrips)('%s round trip', (name, build, parse) => {
  it('keeps a point where it was surveyed', () => {
    const back = parse(build([point()]));
    expect(back.length, `${name} lost the feature entirely`).toBeGreaterThan(0);
    expect(back[0].pts[0].a).toBeCloseTo(LON, 7);
    expect(back[0].pts[0].b).toBeCloseTo(LAT, 7);
  });

  it('keeps every vertex of a line, in order', () => {
    const original = line();
    const back = parse(build([original]));
    expect(back.length).toBeGreaterThan(0);
    expect(back[0].pts.length, `${name} changed the vertex count`).toBe(original.pts.length);
    original.pts.forEach((p, i) => {
      expect(Math.abs(back[0].pts[i].a - p.a), `${name} vertex ${i} easting drifted`).toBeLessThan(TOLERANCE_DEG);
      expect(Math.abs(back[0].pts[i].b - p.b), `${name} vertex ${i} northing drifted`).toBeLessThan(TOLERANCE_DEG);
    });
  });

  it('keeps a parcel boundary closed and the right size', () => {
    // A ring that comes back open, or with its closing vertex duplicated into
    // the point list, changes the computed area of somebody's land.
    const original = polygon();
    const back = parse(build([original]));
    expect(back.length).toBeGreaterThan(0);

    const ring = back[0].pts;
    const first = ring[0];
    const last = ring[ring.length - 1];
    const closedExplicitly = Math.abs(first.a - last.a) < TOLERANCE_DEG && Math.abs(first.b - last.b) < TOLERANCE_DEG;
    const distinct = closedExplicitly ? ring.length - 1 : ring.length;
    expect(distinct, `${name} changed the number of distinct corners`).toBe(original.pts.length);

    // Shoelace over the distinct corners, in square degrees — the shape must be
    // the same whether or not the writer repeated the closing vertex.
    const area = (pts: { a: number; b: number }[]) => {
      let s = 0;
      for (let i = 0; i < pts.length; i++) {
        const u = pts[i], v = pts[(i + 1) % pts.length];
        s += u.a * v.b - v.a * u.b;
      }
      return Math.abs(s) / 2;
    };
    expect(area(ring.slice(0, distinct))).toBeCloseTo(area(original.pts), 12);
  });
});

describe('GPX round trip', () => {
  // GPX carries waypoints and tracks rather than arbitrary geometry, so it gets
  // its own expectations rather than being forced into the shared ones.
  it('keeps a waypoint where it was surveyed', () => {
    const back = gpxParse(gpxBuild([point()]));
    expect(back.length).toBeGreaterThan(0);
    expect(back[0].pts[0].a).toBeCloseTo(LON, 7);
    expect(back[0].pts[0].b).toBeCloseTo(LAT, 7);
  });

  it('keeps every vertex of a track, in order', () => {
    const original = line();
    const back = gpxParse(gpxBuild([original]));
    const all = back.flatMap(f => f.pts);
    expect(all.length, 'GPX changed the vertex count').toBe(original.pts.length);
    original.pts.forEach((p, i) => {
      expect(Math.abs(all[i].a - p.a), `GPX vertex ${i} drifted`).toBeLessThan(TOLERANCE_DEG);
    });
  });
});

describe('the precision the writers actually emit', () => {
  it.each(roundTrips)('%s writes enough decimals to place a boundary', (name, build) => {
    // Five decimals of longitude is about 1.1 m at this latitude. A writer that
    // rounds there moves a plot corner off its neighbour, and the round trip
    // above would still pass if both sides rounded the same way.
    const text = build([point()]);
    const matched = text.match(/\d+\.(\d+)/g) || [];
    const mostDecimals = Math.max(0, ...matched.map(m => (m.split('.')[1] || '').length));
    expect(mostDecimals, `${name} emits at most ${mostDecimals} decimal places`).toBeGreaterThanOrEqual(6);
  });
});
