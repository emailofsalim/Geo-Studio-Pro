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

Verified against the implementation, not the UI copy. The three claims below
that promise a refusal or a partial read are asserted in `formatRefusals.test.ts`
against real file headers, because the alternative to refusing these files is not
an error — it is plausible, meaningless output.

The formats claiming both read and write are covered by `formatRoundTrip.test.ts`,
which writes a feature and reads it back. That is the test that matters for a
writer: a one-way check cannot see a coordinate losing precision in the text
form, a ring closing or opening, or a vertex quietly dropped. Agreement is
required to 1e-7 degrees, about 11 mm of latitude, and the writers are separately
checked to emit enough decimal places — otherwise a writer and reader that round
the same way would agree with each other while both being wrong. Rounding the
writers to five decimals, about 1.1 m, fails eight of those tests.

| Format | Read | Write | Notes |
| --- | --- | --- | --- |
| CSV / TXT | Yes | Yes | Delimiter detection, quoted fields, BOM handling |
| GeoJSON | Yes | Yes | All geometry types including collections |
| KML / KMZ | Yes | Yes | |
| GPX | Yes | Yes | Waypoints, routes, tracks |
| WKT | Yes | Yes | Including MULTI\* variants |
| XLSX | Yes | Yes | Shared strings, inline strings, sparse cells |
| Shapefile | Yes | Yes | SHP + SHX + DBF + PRJ; points, polylines and polygons, one file per geometry type |
| DXF | Partial | Yes | Points, lines and polylines; arcs, circles, splines and text are counted and reported, not imported |
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

**A DXF import says what it could not bring in.** The reader converts points,
lines and polylines. It parses arcs, circles, splines and text too, and then
drops them, because the feature model has no arc or spline to hold them.
Dropping them is the honest limit of the reader; dropping them in silence is
not — a cadastral drawing whose plot boundaries are arcs would import as a
smaller set of straight lines, report how many features arrived, and say
nothing about the ones that did not. The unconverted entities are now counted
by type and reported as an import warning.

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
correction · Delaunay TIN surfaces from surveyed
points, with plan and 3D surface area, volume to a stated datum, surface-to-surface
comparison and marching-triangle contours linked into polylines and sent to GIS
Studio as line features · constrained Delaunay, so a crest, toe, road edge or
ditch given as a breakline is held as a triangle edge · boundary offset ·
topology checks ·
borehole logging with grades · cadastral digitising with GCP georeferencing and
residuals · GNSS averaging · bench and overall slope geometry · drill pattern
layout · blast charge and powder factor · stockpile volumes from either measured
cone/frustum dimensions or a surveyed pickup · block reserves and stripping ratio.

**Implemented but not reachable:** the average-end-area and DTM grid volume
methods. Both compute correctly and are covered by `earthworkVolumes.test.ts`,
but nothing in the application imports either — no screen offers them. They were
listed under *Working* until this was checked, which is the defect this list
exists to prevent, so they have been moved out of it rather than left to read as
an available feature.

Two things to know before wiring the end-area method to a screen, both pinned by
tests. Its sections are signed, so **fill comes back as a negative volume**
rather than a positive quantity of material to place. And a section that runs
from cut to fill is assigned wholly to one side by the sign of its two ends
combined: a span going +10 m² to −10 m² reports zero cut and zero fill, when it
truly holds 50 m³ of each. The *net* volume is right, which is what the method is
for; the split is not, and the split is what gets priced. The DTM grid method has
neither problem — it negates before accumulating, so its fill is positive, and it
classifies each point on its own.

The survey mathematics is checked against values it did not produce:
`surveyMath.test.ts` uses Vincenty's own 1975 worked example (Flinders Peak to
Buninyong, 54 972.271 m, bearing 306°52′05.37″), the published meridian and
equatorial arc lengths, and closed-form geometry for areas, curves and
radiation. Expected values taken from the implementation's own output would only
prove it still does what it did.

`geodeticSystems.test.ts` covers the coordinate systems the same way — against
definitions rather than against themselves. The prime meridian starts zone 31,
the MGRS bands run C to X skipping I and O, the equator on the prime meridian is
at exactly the semi-major axis and the pole at the semi-minor, and the Indian
Grid and ECEF conversions round-trip.

**The Bursa-Wolf reverse is approximate, and the tests say so rather than hiding
it.** Negating the seven parameters does not rotate and rescale the translation
being undone, so a forward-and-back round trip returns to roughly
(scale + rotation) × |translation| — about 4 mm for an 833 m shift with a 1.2″
rotation and 2.5 ppm scale. The test asserts a centimetre bound *and* that the
residual is not zero, so the approximation stays documented behaviour instead of
being mistaken for exactness.

**The statutory boundary offset takes its side from the dropdown, not from the
digitising order.** The Boundary Offset screen used to compute its belt inline,
deriving the offset direction from the ring's winding by assumption. A lease
digitised clockwise therefore had its 7.5 m inward safety barrier placed
*outside* the lease, and the screen reported 13 225 m² of net exploitable area
where the true figure was 7 225 — the wrong way round for a barrier that exists
to be left standing. The same inline code clamped runaway mitre corners in one
direction only, so a sharp corner on an inward offset ran 375 m out on a 7.5 m
belt. The geometry now lives in `offsetPolygonEN` in `geodesy.ts`, shared with
the lat/lon `boundaryOffset`, and is covered by `boundaryOffset.test.ts`.

**An offset that has eaten the parcel is refused rather than measured.** Past
half the width of a block, an inward belt crosses itself edge for edge and comes
out the other side — as a *simple* polygon with the ring's original orientation
intact, so neither a self-intersection test nor a signed area notices. A 100 m
block asked for a 90 m barrier returned a tidy 6 400 m² of "net exploitable
mining area" where nothing is left, and the figure *grew* as the barrier
widened. The offset is now held to its own definition — every vertex must stand
at least the offset distance from the original boundary — and a belt that
collapses the parcel to a point is refused too. The screen says which refusal
happened instead of showing an area.

**The levelling sheet no longer certifies a check it did not perform.** The
results panel printed a green "✓ Mathematical Check Verified" unconditionally:
`checkPassed` was computed, passed to a toast that disappears, and never
consulted by the banner. Worse, the verdict compared only ΣBS − ΣFS against the
change in RL — both consequences of the same height-of-instrument reduction, so
they agree in cases where the booking is unsound. The rise-and-fall route, the
one independent check and the one printed beside them, was left out. A station
booked with both an intermediate sight and a foresight shows ΣBS − ΣFS = 0.100
and ΣRise − ΣFall = 0.300 on the same sheet, and was reported as verified. All
three routes are now checked, the banner states failure and names the route that
is adrift, and each check is returned so a failure can be located.

Two smaller things went with it. A row carrying no sight at all read the missing
value as zero and booked a rise equal to the whole previous reading — a 1.500 m
backsight became a 1.500 m climb to a station nobody sighted; such a row now
carries the level forward and says the level is not determined. And the
`method: 'hi' | 'rise_fall'` parameter, which no line of the function ever read,
has been removed rather than left advertising a choice it did not honour.

**Three-point resection refuses observations it cannot solve, instead of
returning a confident wrong position.** Two faults, both silent:

Fed the angles a theodolite reads from *outside* the control triangle — a
common enough setup, and one the formula as written here does not cover — it
returned positions wrong by 288 m to 2167 m across the cases tested, with
nothing to say it had left its domain. Three angles measured round one point
close on 360°; those observations close on 90° to 205°, so the setup is
recognisable before it is trusted. Observations that miss 360° by more than a
degree are now refused with that explanation. The tolerance is deliberately
loose — genuine misclosure round a point is a matter of seconds — so sloppy but
honest work is not turned away, and the misclosure of an accepted set is
reported on screen rather than assumed to be zero.

On the danger circle, the circle through the three control points, the figure is
indeterminate: every position on it fits the observations. The guard for this
tested only for a vanishing sum of weights, but the weights blow up there rather
than cancelling, so the case went straight through and the screen announced
"Resection point determined: E=NaN, N=NaN". It now refuses.

**The topology audit no longer calls every closed parcel broken.** A polygon ring
that repeats its first position at the end is closed by convention — GeoJSON
requires it, KML and Shapefile produce it, and the reader keeps it. Left in
place, that repeat made the last edge end exactly where the first begins, and
the segment test read the shared endpoint as a crossing. Every properly closed
parcel came back as a **self-intersection error**: a square, a pentagon,
anything. Importing a spec-compliant GeoJSON parcel layer and running the audit
condemned all of it. The ring is now normalised before the checks, as the DXF
writer and the boundary offset already do, and a bow-tie that happens to be
closed is still caught.

One limit worth knowing: the crossing test uses a strict orientation comparison,
so it finds edges that properly cross but not ones that merely touch — a vertex
lying exactly on another edge is not reported. That is a false negative rather
than a false alarm, and it is left as-is because loosening the test is the
change most likely to bring the false alarms back.

**The shapefile reader could not read a polygon until now.** An ESRI
PolyLine/Polygon record is shape type (4 bytes) + bounding box (four doubles)
+ numParts + numPoints, and record content begins at offset + 8, so numParts
sits at offset + 44. The reader took it from offset + 40 — four bytes short,
which is the last word of the box's Ymax double. For a parcel on UTM 44N ground
that read **1 094 967 418 parts**, the loop ran off the end of the buffer, and
the throw was swallowed by the caller's `catch`: a polygon shapefile simply
imported as "unrecognised". Only the point branch, whose offsets were already
right, ever worked — while the format table claimed "multi-part geometry".
It is now read against the published record layout, and `shapefileReader.test.ts`
builds spec-correct files rather than testing the reader against itself.

**The `.prj` now decides the coordinate system, and one layer gets one answer.**
The reader used to accept a `.prj` and ignore it, inferring geographic against
projected from coordinate magnitude — *per feature, and for a polygon from its
first vertex alone*. A local grid spanning its origin could therefore come back
with the far block read as metres and the near block as degrees, in the same
layer, putting one of them off the coast of Africa. And a projected file whose
coordinates happen to be small was read as lat/lon outright.

`parsePrj` reads the file's own statement far enough to answer what matters:
degrees or metres, and if metres, which UTM zone. Only the outermost keyword
decides — every `PROJCS` contains a `GEOGCS` describing its own datum, so a
check for "contains GEOGCS" would call every projected shapefile lat/lon. Three
sources can name the zone and are taken in order of authority: an EPSG code
(32601–32660 north, 32701–32760 south) is a citation and wins; the projection
parameters are the definition itself, with the central meridian giving the zone
and a false northing of 10 000 000 marking the south; the name comes last,
because it is a label a person typed. A central meridian that is not on a zone
boundary yields no zone rather than a rounded guess.

The magnitude test survives only as a fallback when there is no readable `.prj`,
applied once for the whole layer, and it can only ever prove *projected* — a
coordinate beyond ±180 or ±90 cannot be degrees, while small coordinates prove
nothing. That case is reported as inferred, with a warning naming what was
assumed.

**Zipped shapefiles are now actually read.** The Universal import passed the
archive's own bytes to the reader as if they were a `.shp`, which parses to
nothing — so the normal way a shapefile is shipped never got past detection, and
the branch only ever did anything for a bare `.shp`, without its attributes or
its CRS. The `.shp`, `.dbf` and `.prj` members are now located inside the
archive, whatever their case or folder, and handed over together.

**And the import no longer states a coordinate system it never read.** Every
shapefile was reported as `WGS 84 (EPSG:4326)` with status `EXPLICIT` — the
strongest confidence the vocabulary has — for a file whose `.prj` had not been
opened. It now reports what the `.prj` declared and marks it `EXPLICIT`, or says
what it inferred and marks it `INFERRED`.

**Shapefile write was already offered from six screens, and the table said it
was not.** `buildShapefileZip` is reached from GIS Studio, the Cadastral Mapper,
Merge & Split, the Format Converter, the landmark export and the Universal
Export, and the format table recorded shapefile output as unsupported. It is
now written down, and the writer is covered by a round trip through the
application's own reader — the test that matters for a writer, and the one that
would have shown the pair could not agree: the reader could not read a polygon
at all, so the application was writing valid files it could not open.

The writer itself was sound. Its record layout, its `.prj` for a northern or
southern zone, its projection of lat/lon input into the stated zone, and its
`.dbf` attributes all survive the round trip unchanged.

**A mixed layer no longer loses its geometry.** A shapefile holds exactly one
geometry type. The writer used to take whichever type was in the majority and
force every other feature into it, silently: a layer of one parcel and two
boreholes came out as **three points**, the parcel's boundary reduced to its
first vertex and the other three discarded. A borehole in a layer of parcels
went the other way, becoming a ring of a single vertex — geometry most GIS
software will reject. Such a layer is now written as one shapefile per type
inside the archive, which is what the format requires and what the reader
already expected. A layer of a single type, the ordinary case, is unchanged:
one `.shp`, `.shx`, `.dbf` and `.prj` named after the layer.

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

**Each surface carries its own breaklines.** A design crest is not the as-built
one, so in a surface comparison B is constrained by its own lines rather than by
A's. Comparing a constrained surface against an unconstrained one half-applies
the correction and is worth a real amount: on the test case, an unconstrained B
reports 333.3 m³ against A where the same B with its crest held reports 666.7 m³.
When A has breaklines and B has none, the panel says so.

Breakline vertices are survey observations, so they join the point set and extend
the surface if they fall outside the spot heights. That is correct, and it carries
the same risk as any stray point: a mis-keyed breakline coordinate stretches the
hull across ground nobody surveyed, and adds volume.

## What the triangulation is checked against

A triangulation covers the convex hull of its points exactly once. A gap, an
overlap or an inverted triangle all show up as a mismatch against an area
computed from the hull alone, which is why `tinProperties.test.ts` checks that
rather than checking triangles against themselves.

That check found a bug in the triangulation that had nothing to do with
breaklines. Bowyer-Watson starts from a super-triangle enclosing every point and
discards whatever still touches it at the end; the enclosing triangle was sized
at 100× the survey's own width, which is not enough. Three nearly collinear
points have an enormous circumcircle, and when a super-triangle vertex fell
inside it, a real triangle at the edge of the hull counted as touching the border
and was thrown away. Nothing reported it. The surface was simply missing a piece,
and every volume taken from it was short by that much.

Measured over 120 point sets per case: 5 in 120 random scatters lost up to 13 m²,
11 in 120 dense ones up to 28 m², and **every** near-collinear set lost area.
That last family is not a corner case — a road corridor, a bench crest and a
drain string are all near-collinear, and they are most of what a survey contains.

Two things fix it, and a third looked like it did:

- **Enlarging the super-triangle**, which is the substantive fix. The size is a
  trade, not a maximum: too small discards hull triangles, too large lets the
  super-triangle's own coordinates swamp the precision of the in-circle test,
  which then admits triangles that *overlap* — a worse failure, because
  overlapping triangles double-count volume rather than dropping it. Sweeping the
  span showed 1e7 overlapping by 4,480 m² and 1e8 by 3,840 m² on sets that 1e6
  gets exactly right. 1e6 was the only value clean across all six geometry
  families tested.
- **Triangulating in normalised coordinates.** Delaunay is invariant under
  translation and scaling, so the mesh is built centred on the origin and the
  measurements are taken from the original coordinates. On well-spread scatters
  this changes nothing. It earns its place on near-collinear geometry at real UTM
  positions: triangulating those at their true coordinates overlapped on 60 of
  120 sets, the worst double-counting 22,719 m² — an error larger than the pit.
- **Restricting the cavity to the region connected to the new point** was also
  tried, against the theoretical worry that a float-level disagreement in the
  in-circle test splits the cavity in two. Across 720 builds spanning six
  geometry families it changed not one result, so it is not in the code. A guard
  that has never been shown to guard anything is a claim, not a safeguard.

One case remains inexact, and is stated rather than hidden. On near-collinear
geometry the mesh can still come back a single sliver short — a triangle two
millimetres wide at the very edge of the hull. Measured over 120 sets per family
at three positions, the shortfall never exceeded **0.003 m²** and was always a
shortfall, never an overlap. The tests assert that bound and the direction, so
the difference between a negligible sliver and a hole stays visible.

An earlier version of this section reported that real UTM coordinates caused 57
of 200 surveys to lose area. That figure was wrong: the measuring code summed the
hull area from raw coordinates of about 2.6 million, where the shoelace formula
cancels away most of its significant digits. The check was less accurate than the
code it was judging. It now centres the points first, and the honest UTM finding
is the one recorded above.

## Exports are records, so they carry only what was recorded

A plot register, a Khatian land schedule and an ore QA report each settle
something: who holds a parcel, how large it is, whether a hole is worth mining.
A value substituted for one that was never recorded reads as a real observation
to whoever opens the file, and nothing in the file marks it as invented.

Every one of those builders used to fill its gaps with something plausible.
Given three holes logged as ore, ore and barren, the **Ore QA/QC Statistical
Report** produced this:

| Hole | Logged | Reported |
| --- | --- | --- |
| BH-01 | ore, 7.20 m | POSITIVE ORE, 32.50 m |
| BH-02 | ore, 5.80 m | SUB-ECONOMIC, 12.00 m |
| BH-03 | barren, 3.70 m | POSITIVE ORE, 32.50 m |

Not one figure came from the holes. The collar level was 180.5 m for every
hole, the depth was `85 + index × 15`, the intercept alternated between 32.5
and 12.0 according to whether the hole was even or odd in the list, and the
grade was "58.4% Fe" whatever the commodity. The POSITIVE/SUB-ECONOMIC verdict
was then decided by comparing the invented intercept against 20, so two holes
logged identically disagreed and a barren hole was reported as ore.

The cadastral exports did the same to legal facts: a missing owner became
"Standard Landholder" or "Authenticated Rayat", a missing village "Primary
Mouza", a missing land class "Agricultural (Dhani-1)", a missing settlement
status "Final Settled", and a missing area `1000 + index × 250` square metres —
then reported to four decimal places in hectares and acres and totalled into a
"Revenue Summary" audit figure. The Khatian schedule also stamped a Parchha
number, `P-1000 + index`, on every row unconditionally: an invented document
reference against a real landholder. The summary sheet asserted "IBM /
Cadastral Validated" on every export, claiming an external validation that
nothing in this application performs.

All of it now reports what the feature carries and leaves the rest blank. A
blank cell reads as "not recorded"; a plausible number does not. Figures that
derive from missing ones — a strip ratio without a depth, hectares without an
area — are blank too rather than computed from a substitute, the area total
counts only parcels that have one and says how many do not, and the
certification claim is gone. The ore verdict now comes from the classification
the hole was logged with, and is blank when the hole was never classified.

Four more sites in the same builders did the same thing:

- **QGIS ground control points.** A `.points` file pairs image pixel positions
  with ground coordinates so a scanned map can be georeferenced. When no
  feature carried a pixel position the builder took the first ten features
  anyway and laid them out on a grid — (100, −100), (300, −250), (500, −400) —
  pairing real ground coordinates with invented pixel ones. QGIS warps the
  raster onto that correspondence, so every parcel digitised from it sits in
  the wrong place, and the residual column, written as 0.000, claimed a perfect
  fit. Only recorded control points are written now.
- **Surpac geological strings.** An unlevelled string was given
  `100 − pointIndex × 5`, a steady five-metre fall per point that reads as
  surveyed relief in mine planning. It is now the format's no-data level.
- **Ore type in those strings.** An unlabelled string defaulted to `ORE`,
  asserting a geological classification nobody made.
- **Elevation in the table and LandXML exports.** A feature with no level was
  written at 0, which is a real elevation and a surveyed one in coastal work.
  Tables leave it blank; a LandXML CogoPoint is written without its third
  value, which is valid.

The rule was already written down in this codebase, on the collar-depth helper
in the borehole tab: *never substitutes a default; a fabricated depth or
elevation in a collar export reads as a real observation to whoever opens the
file.* It simply had not been applied to the export builders.

## A residual of zero is not evidence of a good fit

The residual is the only thing telling a surveyor whether a georeference is any
good. At the minimum number of control points, it cannot do that job: the fit
passes exactly through every point by construction, so the residual is zero
however wrong the points are.

Both fits here accepted exactly that minimum. The four-parameter Helmert fit
takes two control points; the cadastral digitiser's six-parameter affine takes
three — and three is what someone placing the fewest allowed will use.

Measured, on the Helmert fit with two points one of which is mis-keyed by 50 m:

| | RMS reported | Scale solved |
| --- | --- | --- |
| Two clean points | 0.000 m | 1.000000 |
| Two points, one 50 m wrong | **0.000 m** | **1.062500** |
| Three points, same error | 14.434 m | — |

The error does not vanish at two points. It is absorbed into a 6.25% scale
change, and every coordinate read off that transform is wrong in proportion to
its distance from the origin, while the screen reports a perfect fit.

Both fits now report their redundancy — `2n − unknowns` — beside the residual.
Where it is zero the figure is replaced rather than annotated, because a
`0.000 m` shown next to a caveat still reads as accuracy: the digitiser says
*"Georef fitted on 3 points — residual cannot show an error"*, and the
converter says how many more points would make the residual mean something.

The digitiser's affine solve also moved out of a component `useMemo` into
`geodesy.ts`, so it can be tested at all. The arithmetic is unchanged.

## A standard value never passes for an observation

The atmospheric readings drive the EDM ppm correction, a scale correction
applied to every measured distance. `isLive` on the environmental report
described the *fetch*, not the numbers: a response that arrived without a
pressure still set it, and the correction was computed from the 1013.25 hPa
sea-level standard while the screen showed a green **Live Free API** badge.

The magnitude is not academic on the ground this application is aimed at:

| Site | Substituted-pressure error | Over a 2 km sight |
| --- | --- | --- |
| Bauxite plateau, ~700 m | 32 ppm | **65 mm** |
| Hill site, ~1200 m | 49 ppm | **98 mm** |
| High pit, ~3000 m | 78 ppm | **156 mm** |

The report now carries `substitutedFields`, naming every reading that fell back
to a standard value, and the view shows them beside the live badge. Visibility
is always listed, because it is not among the fields requested from the service
and has always been the standard clear-air figure. A test pins the ppm
magnitude so nobody later reads this as a rounding detail and restores a silent
default.

## The export zone is never assumed

The CRS layer already refuses an unreadable zone rather than substituting one,
and says why it was written that way: it replaced a service-layer version that
parsed the zone with `parseInt(...) || 45`. That substitution had survived in
the export service, in six places — the preview generator for five formats, and
round-trip verification.

A project in Zone 43 whose zone string could not be read was previewed and
verified against Zone 45, which puts the same eastings and northings several
hundred kilometres away. The preview is the last thing anyone looks at before
exporting, so it is the worst place for a plausible wrong answer.

Three further paths defaulted a missing zone to `'45N'` outright, including
`exportData`. The zone is now required of the caller in each, and an unreadable
one is reported: the preview returns a notice, and round-trip verification
returns a failed result rather than throwing at the modal awaiting it.

**The same substitution was also in the path that actually runs.**
`parseUtmZoneStr` — the parse behind `detectAndParseGeospatialFile` and
`executeUniversalExport`, which are the import and export the application really
uses — returned Zone 45 for anything it could not read, and clamped an
out-of-range zone number onto 45 as well, which reads as a deliberate choice
rather than a rejected input. It now refuses. Every form it used to accept
still parses identically, a bare `45` included; only unreadable input behaves
differently. Both call sites already surface errors to the user, so the refusal
is visible where the wrong zone was not.

## The working cutoff rule survives

A cutoff grade decides what counts as ore, so it is a setting, not a scratch
value. It used to live in component state in a tab that is mounted only while
it is the active tab, so tightening Al₂O₃ to ≥ 45 for a contract, glancing at
another screen and coming back silently restored the shipped preset — and every
interval between the two flipped from barren to ore with nothing on screen to
say the rule had changed.

The rule now persists across tab switches and reloads. Reading it back is
deliberately strict: a saved rule that does not validate is refused and the
reason shown, rather than quietly becoming the preset. In particular a
threshold that has gone missing is refused, because comparing every assay
against `undefined` returns false for all of them and reads a whole deposit as
barren while the screen still shows the commodity name.

**The shipped presets carry the Indian Bureau of Mines figures.** Bauxite,
iron, limestone and coal now use the thresholds the application was built
around and that the old `MiningService` encoded — Al₂O₃ ≥ 40 with SiO₂ ≤ 5,
Fe ≥ 45 with SiO₂ ≤ 10, CaO ≥ 42 with SiO₂ ≤ 12, and Ash ≤ 35. The looser
numbers that had drifted into the presets (Al₂O₃ ≥ 30, SiO₂ ≤ 7, Fe ≥ 55,
CaO ≥ 44, Ash ≤ 34) called material ore that IBM would not, and in iron's case
called material barren that IBM would not: 45–55 % Fe was being written off.
Two of these tighten and one loosens, so the change moves intervals in both
directions, and `oreCutoffs.test.ts` pins each threshold at its boundary.

Conditions the IBM cutoff does not mention are kept rather than dropped —
bauxite's TAA presence check, coal's GCV floor, limestone's MgO ceiling —
because adopting a published cutoff is not a reason to discard a constraint the
profile already carried. A preset remains a starting point, not a ruling: the
rule is editable per project, and the rule actually applied is shown on screen
beside the classification.

## Dead code removed rather than left to be mistaken for live

Deleted: five borehole export handlers (Surpac, ore-QA CSV, KML, DXF and
shapefile) that were defined and never wired to a control; `boreCardHTML` and
`cadCardHTML`, two HTML card builders with no callers; `ExportService.validate`
and `ExportService.exportData`, neither of which anything called; an unused
`parseUtmZoneStr` import; and sixteen unused imports in the borehole tab, five
of them orphaned by the deletions and eleven already dead beforehand. About 370
lines.

This matters beyond tidiness. PR #6 in this repository fixed a Zone 45
substitution in a copy nothing could reach while the live path kept the bug, and
the fix looked complete. Unreachable code that mirrors a live path is a standing
invitation to repeat that.

`ExportService.exportData` was a second wrapper around `executeUniversalExport`;
removing it leaves the single export entry point the architecture calls for.
Surpac, KML, DXF and shapefile output all remain available through the Universal
Export, which is where the borehole screen's description now points — it
previously advertised exports that screen no longer offered.

One deletion was replaced rather than dropped. The borehole screen built its
cutoff summary line inline with `${c.v || ''}`, which prints a threshold of 0,
or one that is not set, as blank — so "Al₂O₃ ≥ " read like a rule when it was
not — and dropped the upper bound of a `between`. That inline copy is gone and
the screen now uses `cutoffRuleText`, which was already tested and states both.

## The AI endpoints, and what protects them

**They did not exist in the deployed application.** The frontend calls
`/api/ai/geomatics-assistant` and `/api/ai/gis-copilot`, but there was no
`vercel.json` and no `api/` directory, so Vercel built the Vite output and
served it as a static site. `dist/server.cjs` was built on every deploy and
never run, and both endpoints returned 404 in production — two shipped features
that could not work. They are now serverless functions under `api/`, sharing
their logic with the express server through `src/server/aiService.ts` rather
than being implemented twice.

**Exposing them without protecting them would have been worse than leaving them
broken.** They proxy a paid API with a key the server holds, so anyone who can
reach them can spend the operator's money, and the express server had no auth,
no rate limiting, no origin policy and no security headers, on a 10 MB body
limit, bound to `0.0.0.0`. The protections landed in the same change that made
the endpoints reachable.

What `src/server/requestGuard.ts` does, and — more usefully — what it does not:

| Control | Stops | Does not stop |
| --- | --- | --- |
| Origin check | another website driving a visitor's browser to call the endpoints | a scripted client, which can send any `Origin` it likes |
| Rate limit, per address | casual hammering | a distributed caller; and on serverless the counter is per warm instance, so the real ceiling is the limit times however many are warm |
| 64 KB body cap | tying the process up with megabyte payloads | anything within the cap |
| Bearer token (`AI_API_TOKEN`) | anonymous use entirely | nothing, once the token leaks — and a browser page cannot hold one |

**None of this is authentication**, because the application has no user
accounts. It raises the cost of abuse. A public deployment with a paid key also
needs a spend cap set at the provider, and nothing in this repository can
substitute for one.

Two smaller changes went with it. The server now binds to loopback unless `HOST`
says otherwise, so starting it does not publish those endpoints on every
interface by default. And a request to an unknown `/api/` path returns a JSON
404 rather than falling through to the single-page-application catch-all, which
had been answering `GET /api/ai/gis-copilot` with the app shell and status 200 —
found by testing the running server rather than by reading the routes.

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

A crash-recovery checkpoint that fails now says so. The checkpoint is written on
every edit and its failures used to be swallowed outright, so a user whose
checkpoints were failing — a full storage quota is the realistic cause — was
unprotected against a tab crash with no way to know. Committed work was never at
risk: the save path sets `SAVE_FAILED` and reports the error itself. The notice
says exactly that, so a checkpoint failure does not read as lost work.

It is reported once, not per edit, and again only if protection comes back and
fails a second time. The write happens continuously, so a message that repeated
on every keystroke would be trained away before it mattered — the same reason
the restore dialog stays silent when the saved counts are unknown.

Every write into project data requires an open project. `updateActiveProjectData`
returns without doing anything when none is open, so the paths that write through it
check first and say so. They previously reported success regardless: an imported
survey file that never landed, features "transferred" to a layer that was never
created. The projects screen and the project dashboard were built but never mounted,
so no project could be opened at all and that silent-discard path was the only one
there was.

That check was added at the application level, for import and "send to GIS". The
**tools** that write project data were not covered, and they are reachable with no
project open: GNSS Field Survey, GIS Map Studio and Geofence Sentinel all appear in
the sidebar from a cold start. GNSS Field Survey offered *Save Current Fix to
Registry* and *Start Recording*, showed a waypoint count, and said nothing about
needing a project — while every write no-opped. The tools kept their own local
state, so a saved fix appeared in the list, counted in the header, and was gone on
reload. Nothing failed, and nothing said so.

Those three now show the same panel the dashboard has always shown, naming what the
tool would be doing with a project. The panel is extracted rather than copied, so
there is one implementation instead of four. Tools that only compute — the
coordinate converter, the survey calculator — are deliberately not gated: they write
nothing, so they lose nothing.

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
