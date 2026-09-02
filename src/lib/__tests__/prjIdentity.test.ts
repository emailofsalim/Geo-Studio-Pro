import { describe, it, expect } from 'vitest';
import { parsePrj } from '../crsIdentity';

// Real-world .prj strings, as ArcGIS, QGIS and GDAL actually write them.
const ESRI_UTM_44N =
  'PROJCS["WGS_1984_UTM_Zone_44N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
  'SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],' +
  'UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],' +
  'PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],' +
  'PARAMETER["Central_Meridian",81.0],PARAMETER["Scale_Factor",0.9996],' +
  'PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';

const ESRI_UTM_50S =
  'PROJCS["WGS_1984_UTM_Zone_50S",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
  'SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],' +
  'UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],' +
  'PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],' +
  'PARAMETER["Central_Meridian",117.0],PARAMETER["Scale_Factor",0.9996],' +
  'PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';

const ESRI_GEOGRAPHIC =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,' +
  '298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

const EPSG_UTM_44N =
  'PROJCS["WGS 84 / UTM zone 44N",GEOGCS["WGS 84",DATUM["WGS_1984",' +
  'SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],' +
  'AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],' +
  'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],' +
  'AUTHORITY["EPSG","4326"]],PROJECTION["Transverse_Mercator"],' +
  'PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",81],' +
  'PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],' +
  'PARAMETER["false_northing",0],UNIT["metre",1,AUTHORITY["EPSG","9001"]],' +
  'AUTHORITY["EPSG","32644"]]';

const EPSG_4326 =
  'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,' +
  'AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],' +
  'PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],' +
  'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],' +
  'AUTHORITY["EPSG","4326"]]';

describe('reading a shapefile .prj', () => {
  it('reads an ESRI projected definition', () => {
    const p = parsePrj(ESRI_UTM_44N);
    expect(p.kind).toBe('projected');
    expect(p.name).toBe('WGS_1984_UTM_Zone_44N');
    expect(p.utmZone).toBe(44);
    expect(p.south).toBe(false);
  });

  it('reads a southern zone from its false northing', () => {
    const p = parsePrj(ESRI_UTM_50S);
    expect(p.kind).toBe('projected');
    expect(p.utmZone).toBe(50);
    expect(p.south, 'a false northing of 10 000 000 is the southern hemisphere').toBe(true);
  });

  it('reads a geographic definition as geographic', () => {
    const p = parsePrj(ESRI_GEOGRAPHIC);
    expect(p.kind).toBe('geographic');
    expect(p.utmZone).toBeNull();
  });

  it('does not read a projected file as geographic because it contains a GEOGCS', () => {
    // Every PROJCS contains a GEOGCS describing its own datum. A check for
    // "contains GEOGCS" would call every projected shapefile lat/lon, which is
    // the failure this whole change exists to prevent.
    expect(ESRI_UTM_44N).toContain('GEOGCS');
    expect(parsePrj(ESRI_UTM_44N).kind).toBe('projected');
    expect(EPSG_UTM_44N).toContain('GEOGCS');
    expect(parsePrj(EPSG_UTM_44N).kind).toBe('projected');
  });

  it('prefers the EPSG citation over the inner authorities', () => {
    // The string carries AUTHORITY["EPSG","4326"] for its base geographic CRS
    // partway through. The outermost one, 32644, is the file's own identity.
    const p = parsePrj(EPSG_UTM_44N);
    expect(p.epsg).toBe(32644);
    expect(p.utmZone).toBe(44);
    expect(p.south).toBe(false);
    expect(p.kind).toBe('projected');
  });

  it('reads a plain EPSG:4326 definition', () => {
    const p = parsePrj(EPSG_4326);
    expect(p.kind).toBe('geographic');
    expect(p.epsg).toBe(4326);
    expect(p.utmZone).toBeNull();
  });

  it('derives the zone from the central meridian when there is no EPSG code', () => {
    // Zone n has central meridian 6n - 183. Zone 44 is 81 degrees east.
    expect(parsePrj(ESRI_UTM_44N).utmZone).toBe(44);
    const z1 = ESRI_UTM_44N.replace('"Central_Meridian",81.0', '"Central_Meridian",-177.0')
                            .replace('UTM_Zone_44N', 'Custom_Grid');
    expect(parsePrj(z1).utmZone, 'central meridian -177 is zone 1').toBe(1);
    const z60 = ESRI_UTM_44N.replace('"Central_Meridian",81.0', '"Central_Meridian",177.0')
                            .replace('UTM_Zone_44N', 'Custom_Grid');
    expect(parsePrj(z60).utmZone, 'central meridian 177 is zone 60').toBe(60);
  });

  it('refuses a central meridian that is not on a zone boundary', () => {
    // A transverse Mercator that is not UTM must not be reported as a UTM zone.
    const odd = ESRI_UTM_44N.replace('"Central_Meridian",81.0', '"Central_Meridian",82.5')
                            .replace('UTM_Zone_44N', 'Custom_TM');
    const p = parsePrj(odd);
    expect(p.kind).toBe('projected');
    expect(p.utmZone, 'a 82.5 degree meridian is no UTM zone').toBeNull();
  });

  it('states nothing it cannot establish', () => {
    for (const junk of ['', '   ', 'not a prj at all', null, undefined]) {
      const p = parsePrj(junk as any);
      expect(p.kind, String(junk)).toBeNull();
      expect(p.utmZone, String(junk)).toBeNull();
      expect(p.south, String(junk)).toBeNull();
    }
  });

  it('tolerates a byte-order mark and surrounding whitespace', () => {
    const p = parsePrj('﻿\n  ' + ESRI_UTM_44N + '  \n');
    expect(p.kind).toBe('projected');
    expect(p.utmZone).toBe(44);
  });

  it('reads a WKT2 projected definition', () => {
    const wkt2 = 'PROJCRS["WGS 84 / UTM zone 44N",BASEGEOGCRS["WGS 84",' +
      'DATUM["World Geodetic System 1984",ELLIPSOID["WGS 84",6378137,298.257223563]]],' +
      'CONVERSION["UTM zone 44N",METHOD["Transverse Mercator"]],ID["EPSG",32644]]';
    const p = parsePrj(wkt2);
    expect(p.kind).toBe('projected');
    expect(p.epsg).toBe(32644);
    expect(p.utmZone).toBe(44);
  });
});
