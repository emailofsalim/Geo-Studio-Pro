import { GeoFeature, QAProblem, QAResult } from '../types';
import { selfIntersects } from './geodesy';

export function qaCheckCSV(rows: string[][]): QAResult {
  const issues: QAProblem[] = [];
  const add = (sev: 'err' | 'warn' | 'info', type: string, detail: string, fix: string) => {
    issues.push({ sev, type, detail, fix });
  };

  if (!rows || rows.length < 2) {
    return { issues: [{ sev: 'err', type: 'Empty File', detail: 'CSV has no data rows', fix: 'Upload a populated CSV file.' }], nErr: 1, nWarn: 0 };
  }

  const hdr = rows[0].map(h => String(h || '').trim().toLowerCase());
  const iLon = hdr.findIndex(h => h === 'longitude' || h === 'lon');
  const iLat = hdr.findIndex(h => h === 'latitude' || h === 'lat');
  const iE = hdr.findIndex(h => h === 'easting' || h === 'e');
  const iN = hdr.findIndex(h => h === 'northing' || h === 'n');
  const dupMap = new Map<string, number>();

  rows.slice(1).forEach((r, idx) => {
    const rowNum = idx + 2;
    const lo = iLon >= 0 ? parseFloat(r[iLon]) : NaN;
    const la = iLat >= 0 ? parseFloat(r[iLat]) : NaN;
    const e = iE >= 0 ? parseFloat(r[iE]) : NaN;
    const n = iN >= 0 ? parseFloat(r[iN]) : NaN;
    const hasLL = !isNaN(lo) && !isNaN(la);
    const hasEN = !isNaN(e) && !isNaN(n);

    if (!hasLL && !hasEN) {
      add('err', 'Missing Coordinates', `Row ${rowNum} has neither Lon/Lat nor Easting/Northing.`, 'Fill either Longitude & Latitude or Easting & Northing.');
      return;
    }

    if (hasLL) {
      if (Math.abs(lo) < 1e-4 && Math.abs(la) < 1e-4) {
        add('err', 'Null Island (0,0)', `Row ${rowNum} coordinates are (0,0) located in the ocean.`, 'Replace with true coordinates or remove row.');
      }
      if (la < -90 || la > 90) {
        add('err', 'Latitude Out of Range', `Row ${rowNum} Latitude (${la}) exceeds [-90, 90].`, 'Check if Easting/Northing was entered into Latitude column.');
      }
      if (lo < -180 || lo > 180) {
        add('err', 'Longitude Out of Range', `Row ${rowNum} Longitude (${lo}) exceeds [-180, 180].`, 'Longitude must be between -180 and 180.');
      }
      if (la >= 60 && la <= 100 && lo >= 6 && lo <= 40) {
        add('warn', 'Swapped Lon/Lat', `Row ${rowNum} appears to have Longitude & Latitude swapped.`, 'Swap the columns (e.g. India Longitude ~73-96, Latitude ~8-37).');
      }
      const k = `ll:${lo.toFixed(6)},${la.toFixed(6)}`;
      dupMap.set(k, (dupMap.get(k) || 0) + 1);
    } else {
      if (e === 0 && n === 0) {
        add('err', 'Null Island (0,0)', `Row ${rowNum} UTM coordinates are (0,0).`, 'Fill valid Easting and Northing values.');
      }
      if (e < 100000 || e > 900000) {
        add('err', 'Easting Out of Range', `Row ${rowNum} Easting (${e} m) is outside valid UTM range [100000, 900000].`, 'Verify UTM Zone and check for swapped E/N.');
      }
      if (n < 0 || n > 10000000) {
        add('err', 'Northing Out of Range', `Row ${rowNum} Northing (${n} m) is outside valid UTM range [0, 10000000].`, 'Verify UTM Zone / hemisphere.');
      }
      const k = `en:${e.toFixed(2)},${n.toFixed(2)}`;
      dupMap.set(k, (dupMap.get(k) || 0) + 1);
    }
  });

  dupMap.forEach((count, key) => {
    if (count > 1) {
      add('warn', 'Duplicate Coordinates', `${count} points share coordinate ${key.slice(3)}.`, 'Verify if duplicate stations or stacked markers are intended.');
    }
  });

  const nErr = issues.filter(i => i.sev === 'err').length;
  const nWarn = issues.filter(i => i.sev === 'warn').length;
  return { issues, nErr, nWarn };
}

export function qaCheckFeatures(feats: GeoFeature[]): QAResult {
  const issues: QAProblem[] = [];
  const add = (sev: 'err' | 'warn' | 'info', type: string, detail: string, fix: string) => {
    issues.push({ sev, type, detail, fix });
  };

  feats.forEach(f => {
    if (f.geom === 'point') {
      const p = f.pts[0];
      if (p && Math.abs(p.a) < 1e-4 && Math.abs(p.b) < 1e-4) {
        add('err', 'Point at 0,0', `Feature "${f.name || '(unnamed)'}" is located at (0,0).`, 'Check coordinate position.');
      }
    } else if (f.geom === 'polygon') {
      if (f.pts.length < 3) {
        add('err', 'Degenerate Polygon', `Polygon "${f.name || '(unnamed)'}" has fewer than 3 vertices.`, 'Polygons require at least 3 distinct vertices.');
      } else {
        const xy = f.pts.map(p => ({ x: p.a, y: p.b }));
        if (selfIntersects(xy)) {
          add('warn', 'Self-intersecting Polygon', `Polygon "${f.name || '(unnamed)'}" crosses itself / bow-tie geometry.`, 'Inspect vertex ordering.');
        }
      }
    } else if (f.geom === 'line') {
      if (f.pts.length < 2) {
        add('err', 'Degenerate Line', `Line "${f.name || '(unnamed)'}" has fewer than 2 vertices.`, 'LineStrings require at least 2 points.');
      }
    }
  });

  const nErr = issues.filter(i => i.sev === 'err').length;
  const nWarn = issues.filter(i => i.sev === 'warn').length;
  return { issues, nErr, nWarn };
}

export function validateFeatures(feats: GeoFeature[], _zone?: string): QAResult {
  return qaCheckFeatures(feats);
}


export type QAReport = QAResult;

