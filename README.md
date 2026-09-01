# BhuNex Studio

A professional, offline-first geomatics suite for GIS, survey, cadastral mapping and
mining work. Formerly Geo Studio.

BhuNex Studio is the consolidation of a family of separate projects — three distinct
codebase lineages and seven versions of a cadastral digitizer — into one application.
This document records what it is, what it can actually do, and what it deliberately
refuses to do.

## Running it

```bash
npm install
npm run dev        # development server on :3000
npm run build      # production bundle + server
npm start          # serve the built app
```

Quality gates:

```bash
npm run lint       # tsc --noEmit
npm test           # vitest
npm run verify     # both
```

`GEMINI_API_KEY` enables the AI copilot features. It is read only on the server
(`server.ts`) and never reaches the client bundle. The app is fully usable without it.

## Architecture

```
src/
  engines/     Domain engines, independent of React
    crs.js       Coordinate reference systems, projections, datums, zone detection
    reports.ts   Print-ready report generation
  lib/         Computation and IO
    crsIdentity.ts     CRS naming, EPSG codes, the zone catalogue
    geodesy.ts         Survey mathematics: traverse, levelling, curves, volumes
    formats.ts         Format readers and writers
    universalDataBridge.ts  Central import detection and export routing
    sensorResourceManager.ts  Just-in-time device sensor lifecycle
    pdfRaster.ts       PDF page rendering for sheet digitising
  services/    Project, storage, import/export services
  components/  UI, one file per application tab
  context/     Project, auth and toast providers
```

## The rule that shapes this codebase

**A UTM easting/northing pair cannot identify its own coordinate system.** The same
numbers are a real, self-consistent place in all sixty UTM zones. Nothing in the
coordinates tells you which one.

Earlier versions of this software inferred the projection from coordinate magnitude and
assumed Zone 45. That works in Jharkhand and silently places Rajasthan data hundreds of
kilometres from where it belongs — with no error, because the arithmetic succeeds either
way. Wrong survey data that looks right is worse than no data.

So, throughout:

- `src/engines/crs.js` separates what can be inferred from coordinates (the CRS *family*,
  from disjoint numeric ranges) from what cannot (the *zone*). With weak evidence it
  returns `needsConfirmation` and ranked candidates rather than picking one. It rejects a
  declared EPSG code that contradicts the observed coordinate magnitudes.
- The working coordinate system belongs to the **project**, not to the browser. Switching
  project switches the CRS in the same render.
- Every EPSG code comes from `crsIdentityFor()`, which emits 326xx north and 327xx south.
  No EPSG code is written by hand anywhere.
- Every report declares its CRS in the header and repeats it in the footer, and cannot be
  generated without one.
- An importer that cannot determine the CRS says so; it does not assume WGS 84.

## Format support

Verified against the implementation, not the UI copy.

| Format | Read | Write | Notes |
| --- | --- | --- | --- |
| CSV / TXT | Yes | Yes | Delimiter detection, quoted fields, BOM handling |
| GeoJSON | Yes | Yes | All geometry types including collections |
| KML / KMZ | Yes | Yes | |
| GPX | Yes | Yes | Waypoints, routes, tracks |
| WKT | Yes | Yes | Including MULTI\* variants |
| XLSX | Yes | Yes | Shared strings, inline strings, sparse cells |
| Shapefile | Yes | — | SHP + DBF, multi-part geometry |
| DXF | Partial | Yes | LINE and LWPOLYLINE only — no arcs, blocks or splines |
| PDF | Yes | — | Rendered as a digitising background, multi-page |
| GeoTIFF | Header | — | Dimensions, pixel scale, tiepoint, EPSG. Pixel data not read |
| LAS | Partial | — | Uncompressed only; subsamples large clouds and says so |
| LAZ | No | — | Rejected explicitly — see below |
| DWG | No | No | Not implemented |

**LAZ is rejected rather than accepted.** Compressed LAZ files carry the same `LASF`
signature as uncompressed LAS. Reading their compressed point records as raw integers
produces plausible-looking, meaningless coordinates without any error. Refusing the file
is the honest outcome; decompress to `.las` and import that.

**GeoTIFF reads the header, not the raster.** It reports the true footprint from
`ModelPixelScale` and `ModelTiepoint`. A TIFF with no georeferencing tags is reported as
such rather than being placed at the origin.

## Applications

Projects · Dashboard · GNSS Field Survey · GIS Map Studio · Cadastral Land Mapper ·
Borehole Stratigraphy · GPS Map Camera · Coordinate Converter · Survey Calculator ·
Field Sensors & Theodolite · Geofence Sentinel · BhuNaksha Digitizer · Universal
Converter · Merge & Split · Boundary Offset & Buffer · Reports · Tutorials · Help

### Capability status

Stated honestly, because a planned capability presented as an existing one is a defect.

**Working:** Vincenty distance and bearing · UTM forward/inverse · MGRS · Plus Codes ·
Indian Grid zones · Bursa-Wolf datum transforms · Helmert fit · Bowditch traverse
adjustment · differential levelling · circular curves · resection · grid-to-ground
correction · end-area and DTM grid volumes · boundary offset · topology checks ·
borehole logging with grades · cadastral digitising with GCP georeferencing and
residuals · GNSS averaging.

**Partial:** Bluetooth RTK (link and GATT plumbing; no NTRIP client, no RTCM decoding) ·
mine profiles (data structures and ore-grade thresholds; no pit or bench model) · point
clouds (uncompressed LAS ingest, subsampled; no rendering or classification) ·
theodolite, spirit level and AR stakeout (device-sensor views, not instrument protocols) ·
serial and HID (device selection; no total-station protocol layer).

**Not implemented:** blast design · drill pattern planning · bench and face modelling ·
haul-road design · stockpile volumes from surfaces · production, dispatch and
reconciliation · drone photogrammetry · DSM/DTM raster pipelines · 3D visualisation ·
TIN surfaces.

## Device sensors

`sensorResourceManager.ts` enforces a just-in-time lifecycle: no listeners are registered
at launch, resources are acquired per consumer token when a feature opens, suspended when
the tab is hidden, and released on unmount. It keeps an audit log and offers a kill
switch, both surfaced in the Sensor Privacy Monitor.

Several hardware views still call device APIs directly rather than through the manager,
so the audit log does not yet cover the whole application. That work is outstanding.

## Data safety

Projects are isolated: data, layers and coordinate systems are keyed per project.
Storage keys deliberately keep their pre-rebrand names — renaming them would orphan every
existing user's saved work on first launch of the rebranded build.

## Provenance

| Source | Contribution |
| --- | --- |
| Geo-Studio-Pro | UI, application shell, sensor architecture, feature breadth |
| Testing1 (modular lineage) | CRS engine, reporting concept, app-manifest architecture |
| geo-studio-complete | Shell patterns, cross-app data bridges |
| bhunaksha-digitizer v16.3 | Cadastral digitising engines and GCP mathematics |
| bhunaksha-digitizer-wpav3 | PDF sheet pipeline |
| Geo-Studio | The original single-file product this grew from |
