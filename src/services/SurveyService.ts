// ============================================================================
// BhuNex Studio — Deterministic Survey Engineering Engine
// ============================================================================

import { CalculationTraceRecord } from '../types/canonical';

export interface TraverseLeg {
  fromStation: string;
  toStation: string;
  observedLength: number; // in meters
  observedBearingDeg: number; // in degrees [0..360)
}

export interface AdjustedTraverseStation {
  station: string;
  rawEasting: number;
  rawNorthing: number;
  adjEasting: number;
  adjNorthing: number;
  correctionE: number;
  correctionN: number;
}

export interface TraverseAdjustmentResult {
  method: 'Bowditch' | 'Transit';
  totalLength: number;
  closingErrorE: number;
  closingErrorN: number;
  linearMisclosure: number;
  relativePrecision: string; // e.g. "1 : 12,450"
  stations: AdjustedTraverseStation[];
  traceLog: CalculationTraceRecord;
}

export interface LevelEntry {
  station: string;
  backSight?: number;
  interSight?: number;
  foreSight?: number;
  remark?: string;
}

export interface ReducedLevelRow {
  station: string;
  bs?: number;
  is?: number;
  fs?: number;
  rise?: number;
  fall?: number;
  hi?: number;
  rl: number;
  remark?: string;
}

export interface LevelReductionResult {
  method: 'RiseAndFall' | 'HeightOfInstrument';
  initialRL: number;
  finalRL: number;
  sumBS: number;
  sumFS: number;
  sumRise: number;
  sumFall: number;
  arithmeticCheckPassed: boolean;
  rows: ReducedLevelRow[];
  traceLog: CalculationTraceRecord;
}

export interface DtmGridVolumeResult {
  gridCellSizeM: number;
  cellAreaM2: number;
  totalCutM3: number;
  totalFillM3: number;
  netVolumeM3: number;
  referenceLevelM: number;
  cellCount: number;
  traceLog: CalculationTraceRecord;
}

export class SurveyService {
  /**
   * Bowditch (Compass Rule) Traverse Adjustment
   */
  static adjustTraverseBowditch(
    startCoord: { easting: number; northing: number },
    legs: TraverseLeg[],
    knownEndCoord?: { easting: number; northing: number }
  ): TraverseAdjustmentResult {
    const endStationCoord = knownEndCoord || startCoord; // Loop traverse default
    let totalLength = 0;
    const computedPoints: { station: string; e: number; n: number; legLen: number; dE: number; dN: number }[] = [];

    let curE = startCoord.easting;
    let curN = startCoord.northing;

    for (const leg of legs) {
      const rad = (leg.observedBearingDeg * Math.PI) / 180;
      const dE = leg.observedLength * Math.sin(rad);
      const dN = leg.observedLength * Math.cos(rad);

      curE += dE;
      curN += dN;
      totalLength += leg.observedLength;

      computedPoints.push({
        station: leg.toStation,
        e: curE,
        n: curN,
        legLen: leg.observedLength,
        dE,
        dN
      });
    }

    const misclosureE = curE - endStationCoord.easting;
    const misclosureN = curN - endStationCoord.northing;
    const linearMisclosure = Math.hypot(misclosureE, misclosureN);
    const precisionRatio = linearMisclosure > 0.0001 ? Math.round(totalLength / linearMisclosure) : 999999;

    // Apply Bowditch corrections: corr = - (misclosure * cumulativeLength / totalLength)
    let cumulativeDist = 0;
    const stations: AdjustedTraverseStation[] = [
      {
        station: legs[0]?.fromStation || 'STN-1',
        rawEasting: startCoord.easting,
        rawNorthing: startCoord.northing,
        adjEasting: startCoord.easting,
        adjNorthing: startCoord.northing,
        correctionE: 0,
        correctionN: 0
      }
    ];

    for (const pt of computedPoints) {
      cumulativeDist += pt.legLen;
      const corrE = -(misclosureE * (cumulativeDist / (totalLength || 1)));
      const corrN = -(misclosureN * (cumulativeDist / (totalLength || 1)));

      stations.push({
        station: pt.station,
        rawEasting: pt.e,
        rawNorthing: pt.n,
        adjEasting: pt.e + corrE,
        adjNorthing: pt.n + corrN,
        correctionE: corrE,
        correctionN: corrN
      });
    }

    const traceLog: CalculationTraceRecord = {
      id: `calc_traverse_${Date.now()}`,
      timestamp: Date.now(),
      method: 'Bowditch (Compass Rule) Traverse Balancing',
      category: 'Traverse',
      inputParameters: { startCoord, knownEndCoord, legCount: legs.length, totalLengthM: totalLength },
      outputValues: {
        closingErrorE: misclosureE,
        closingErrorN: misclosureN,
        linearMisclosureM: linearMisclosure,
        precision: `1 : ${precisionRatio.toLocaleString()}`
      },
      units: { inputUnit: 'm / deg', outputUnit: 'm' },
      precisionUsed: {
        calculationPrecision: 12,
        storedPrecision: 6,
        displayPrecision: 3,
        exportPrecision: 4
      },
      isPassed: linearMisclosure < 1.0
    };

    return {
      method: 'Bowditch',
      totalLength,
      closingErrorE: misclosureE,
      closingErrorN: misclosureN,
      linearMisclosure,
      relativePrecision: `1 : ${precisionRatio.toLocaleString()}`,
      stations,
      traceLog
    };
  }

  /**
   * Deterministic Rise & Fall Leveling Reduction
   */
  static reduceLevelsRiseAndFall(initialRL: number, entries: LevelEntry[]): LevelReductionResult {
    let currentRL = initialRL;
    let sumBS = 0;
    let sumFS = 0;
    let sumRise = 0;
    let sumFall = 0;

    const rows: ReducedLevelRow[] = [];
    let prevReading: number | null = null;

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      let reading = e.backSight !== undefined ? e.backSight : (e.interSight !== undefined ? e.interSight : e.foreSight);
      if (e.backSight !== undefined) sumBS += e.backSight;
      if (e.foreSight !== undefined) sumFS += e.foreSight;

      let rise: number | undefined;
      let fall: number | undefined;

      if (prevReading !== null && reading !== undefined) {
        const diff = prevReading - reading;
        if (diff > 0) {
          rise = diff;
          sumRise += diff;
          currentRL += diff;
        } else if (diff < 0) {
          fall = Math.abs(diff);
          sumFall += fall;
          currentRL -= fall;
        }
      }

      rows.push({
        station: e.station,
        bs: e.backSight,
        is: e.interSight,
        fs: e.foreSight,
        rise,
        fall,
        rl: currentRL,
        remark: e.remark
      });

      // Prepare previous reading for next step
      prevReading = e.backSight ?? reading ?? null;
    }

    const check1 = Math.abs((sumBS - sumFS) - (sumRise - sumFall)) < 0.002;
    const check2 = Math.abs((sumRise - sumFall) - (currentRL - initialRL)) < 0.002;

    const traceLog: CalculationTraceRecord = {
      id: `calc_level_${Date.now()}`,
      timestamp: Date.now(),
      method: 'Rise and Fall Level Loop Reduction',
      category: 'Leveling',
      inputParameters: { initialRL, entryCount: entries.length, sumBS, sumFS, sumRise, sumFall },
      outputValues: {
        finalRL: currentRL,
        totalRise: sumRise,
        totalFall: sumFall,
        checkPassed: check1 && check2
      },
      units: { inputUnit: 'm', outputUnit: 'm' },
      precisionUsed: {
        calculationPrecision: 12,
        storedPrecision: 6,
        displayPrecision: 3,
        exportPrecision: 4
      },
      isPassed: check1 && check2
    };

    return {
      method: 'RiseAndFall',
      initialRL,
      finalRL: currentRL,
      sumBS,
      sumFS,
      sumRise,
      sumFall,
      arithmeticCheckPassed: check1 && check2,
      rows,
      traceLog
    };
  }

  /**
   * Deterministic DTM Grid Cut & Fill Volume Calculation
   */
  static computeGridVolume(
    gridElevations: { x: number; y: number; z: number }[],
    referenceLevelM: number,
    cellSizeM: number = 10
  ): DtmGridVolumeResult {
    const cellArea = cellSizeM * cellSizeM;
    let totalCut = 0;
    let totalFill = 0;

    for (const pt of gridElevations) {
      const deltaH = pt.z - referenceLevelM;
      if (deltaH > 0) {
        totalCut += deltaH * cellArea;
      } else if (deltaH < 0) {
        totalFill += Math.abs(deltaH) * cellArea;
      }
    }

    const netVolume = totalCut - totalFill;

    const traceLog: CalculationTraceRecord = {
      id: `calc_volume_${Date.now()}`,
      timestamp: Date.now(),
      method: 'DTM Grid Cell Surface Integration',
      category: 'Volume',
      inputParameters: { pointCount: gridElevations.length, cellSizeM, referenceLevelM, cellAreaM2: cellArea },
      outputValues: {
        cutVolumeM3: totalCut,
        fillVolumeM3: totalFill,
        netVolumeM3: netVolume
      },
      units: { inputUnit: 'm / m²', outputUnit: 'm³' },
      precisionUsed: {
        calculationPrecision: 12,
        storedPrecision: 6,
        displayPrecision: 3,
        exportPrecision: 4
      },
      isPassed: true
    };

    return {
      gridCellSizeM: cellSizeM,
      cellAreaM2: cellArea,
      totalCutM3: totalCut,
      totalFillM3: totalFill,
      netVolumeM3: netVolume,
      referenceLevelM,
      cellCount: gridElevations.length,
      traceLog
    };
  }
}
