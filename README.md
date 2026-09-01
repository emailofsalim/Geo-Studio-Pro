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

TypeScript runs with `strictNullChecks`. Turning it on surfaced fifty real
issues — `.toFixed()` on a borehole depth that may not have been recorded, an
optional callback invoked unconditionally, several `[]` literals inferred as
`never[]` — all fixed rather than suppressed. There are no `any` escape hatches
added to keep it quiet.

`GEMINI_API_KEY` enables the AI copilot features. It is read only on the server
(`server.ts`) and never reaches the client bundle. The app is fully usable without it.

## Architecture

```
src/
  engines/     Domain engines, independent of React
    crs.js       Coordinate reference systems, projections, datums, zone detection
    mining.ts    Bench geometry, drill pattern, blast design, stockpiles, reserves
    tin.ts       Constrained Delaunay TIN surfaces: breaklines, areas, volumes,
                 surface comparison, contours
    reports.ts   Print-ready report generation
  lib/         Computation and IO
    crsIdentity.ts     CRS naming, EPSG codes, the zone catalogue
    geodesy.ts         Survey mathematics: traverse, levelling, curves, volumes
    surfacePointText.ts Reads a pasted E, N, RL point list, and breakline blocks
    formats.ts         Format readers and writers
    universalDataBridge.ts  Central import detection and export routing
    parseClient.ts     Import front door; offloads large files to a worker
    workers/           Web Workers (import parsing)
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
- A project's **working zone is the single source of truth, and its CRS label is derived
  from it** — on creation, and on import. They are never stored as two independent
  values, because nothing keeps two values in step. Where an imported package declares a
  CRS naming a different zone from its working zone, the working zone wins (it is the
  grid the coordinates were computed on) and the disagreement is reported as an import
  issue rather than absorbed.
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
| World file | Yes | — | .tfw / .jgw / .pgw / .wld raster georeference |
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
Field Sensors & Theodolite · Geofence Sentinel · BhuNaksha Digitizer · Mining Studio ·
Universal Converter · Merge & Split · Boundary Offset & Buffer · Reports · Tutorials ·
Help

### Capability status

Stated honestly, because a planned capability presented as an existing one is a defect.

**Working:** Vincenty distance and bearing · UTM forward/inverse · MGRS · Plus Codes ·
Indian Grid zones · Bursa-Wolf datum transforms · Helmert fit · Bowditch traverse
adjustment · differential levelling · circular curves · resection · grid-to-ground
correction · end-area and DTM grid volumes · Delaunay TIN surfaces from surveyed
points, with plan and 3D surface area, volume to a stated datum, surface-to-surface
comparison and marching-triangle contours linked into polylines and sent to GIS
Studio as line features · constrained Delaunay, so a crest, toe, road edge or
ditch given as a breakline is held as a triangle edge · boundary offset ·
topology checks ·
borehole logging with grades · cadastral digitising with GCP georeferencing and
residuals · GNSS averaging · bench and overall slope geometry · drill pattern
layout · blast charge and powder factor · stockpile volumes from either measured
cone/frustum dimensions or a surveyed pickup · block reserves and stripping ratio.

**Partial:** Bluetooth RTK (link and GATT plumbing; no NTRIP client, no RTCM decoding) ·
pit modelling (bench and wall geometry are calculated, but there is no 3D pit shell or
ramp design) · point
clouds (uncompressed LAS ingest, subsampled; no rendering or classification) ·
theodolite, spirit level and AR stakeout (device-sensor views, not instrument protocols) ·
serial and HID (device selection; no total-station protocol layer).

**Not implemented:** haul-road design · production, dispatch and reconciliation ·
drone photogrammetry · DSM/DTM raster pipelines · 3D visualisation · contour
smoothing and labelling (contours are linked into polylines but drawn as the exact
intersection with each face, with no spline fitting and no index-contour annotation)
· resolving a breakline crossing where the two lines disagree on the height (both
are reported with the gap between them and left out — see below).

## Import and export

Every geospatial import goes through one parser (`detectAndParseGeospatialFile`),
reached via `parseClient`. Detection is by content signature first, extension
second, so a mislabelled file still lands in the right reader. Tabs that need a
domain-specific import — the cadastral CSV that groups rows into parcels, an
archive that expands to several datasets — keep that logic locally and use the
central parser for everything else.

Files over 2 MB parse in a Web Worker. That threshold is measured, not assumed:
below it an inline parse is imperceptible and the worker round trip is pure
overhead, while above it the transfer cost buys a UI that keeps responding.
Where workers are blocked, the same parser runs inline.

Exports build their payloads with the shared builders in `formats.ts` and are
delivered through one `downloadBlob` helper, which revokes the object URL it
creates.

## Device sensors

`sensorResourceManager.ts` enforces a just-in-time lifecycle: no listeners are registered
at launch, resources are acquired per consumer token when a feature opens, suspended when
the tab is hidden, and released on unmount. It keeps an audit log and offers a kill
switch, both surfaced in the Sensor Privacy Monitor.

Camera, microphone, location, orientation, motion, Bluetooth, NFC, serial, HID and
screen wake lock all run through it, so the audit log and the kill switch cover the
whole application.

## Breaklines

A Delaunay triangulation is free to span across a crest, and will do so whenever
that produces rounder triangles. The modelled ridge then sags to the height of the
ground either side of it — with no error, because the triangulation is doing exactly
what it is supposed to. On the control case in the tests, a 20 m crest across a
diamond-shaped site, the unconstrained surface puts the crest at ground level and
reports **333.3 m³**; the same points with the crest given as a breakline report
**666.7 m³**. Exactly double, and the second figure is the right one.

So `buildTin` takes breaklines and forces their segments in as triangle edges, by
the standard cavity method: remove the triangles the edge crosses, then
re-triangulate the two halves Delaunay-optimally. What it will not do:

- **Guess at a crossing.** Where two breaklines cross, the ground has one
  elevation. Usually both lines agree on it — a track crossing a crest at grade —
  and then there is nothing to resolve: the junction becomes a surface point and
  both lines are split there. Only a genuine disagreement is refused, and then
  both heights and the gap between them are quoted: *"Crest and Drain cross at
  10.000, 5.000, where one is 10.000 m and the other 0.000 m — 10.000 m apart."*
  Agreement is judged to a millimetre, which is the same point in survey terms.
- **Overrule a surveyed point.** A breakline vertex landing on a position already
  surveyed keeps the surveyed height, and the disagreement is reported.
- **Drop one silently.** Every requested segment is either in `constraints` or
  explained in `breaklineIssues`. A breakline that was asked for and not applied
  would leave a surface that looks constrained and is not.

A constraint running over existing vertices is split at each one — a haul road
across a gridded survey passes through a grid vertex at every step, and an edge
cannot run through a vertex without using it.

Breakline vertices are survey observations, so they join the point set and extend
the surface if they fall outside the spot heights. That is correct, and it carries
the same risk as any stray point: a mis-keyed breakline coordinate stretches the
hull across ground nobody surveyed, and adds volume.

## Data safety

Projects are isolated: data, layers and coordinate systems are keyed per project.
Storage keys deliberately keep their pre-rebrand names — renaming them would orphan every
existing user's saved work on first launch of the rebranded build.

Restoring a crash checkpoint replaces the project's saved data outright, which is
right after a crash — the checkpoint is the newer state — but it is an overwrite with
no undo. The recovery dialog therefore shows each checkpoint count beside what the
project currently has saved, and names exactly what would be lost when the checkpoint
holds less. It stays silent when the saved counts are unknown, because warning on
every restore would train the warning away before it mattered.

Every write into project data requires an open project. `updateActiveProjectData`
returns without doing anything when none is open, so the paths that write through it
check first and say so. They previously reported success regardless: an imported
survey file that never landed, features "transferred" to a layer that was never
created. The projects screen and the project dashboard were built but never mounted,
so no project could be opened at all and that silent-discard path was the only one
there was.

## Provenance

| Source | Contribution |
| --- | --- |
| Geo-Studio-Pro | UI, application shell, sensor architecture, feature breadth |
| Testing1 (modular lineage) | CRS engine, reporting concept, app-manifest architecture |
| geo-studio-complete | Shell patterns, cross-app data bridges |
| bhunaksha-digitizer v16.3 | Cadastral digitising engines and GCP mathematics |
| bhunaksha-digitizer-wpav3 | PDF sheet pipeline |

The Mining Studio and the reporting engine are new work rather than ports; no source
lineage carried them.
| Geo-Studio | The original single-file product this grew from |
