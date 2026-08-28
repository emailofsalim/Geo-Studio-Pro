// Voice Commander & Spoken Turn-by-Turn Stakeout Navigation Engine
// Provides Web Speech Recognition, Text-to-Speech Synthesis, and Geodetic Direction Prompts

import { isSpeechRecognitionSupported, isSpeechSynthesisSupported, speakVoiceAnnouncement } from './hardwareComms';

export { isSpeechRecognitionSupported, isSpeechSynthesisSupported, speakVoiceAnnouncement };

export interface StakeoutGuidance {
  distanceMeters: number;
  distanceDisplay: string;
  bearingDeg: number;
  relativeTurnDeg: number;
  turnDirection: 'left' | 'right' | 'straight' | 'behind';
  forwardMeters: number;
  lateralMeters: number;
  lateralDirection: 'left' | 'right';
  spokenInstruction: string;
  shortVisualInstruction: string;
  isOnTarget: boolean;
  isApproaching: boolean;
}

/**
 * Calculates geodetic turn-by-turn spoken guidance from current location/heading to target
 */
export function calculateStakeoutGuidance(
  currentE: number,
  currentN: number,
  headingDeg: number,
  targetE: number,
  targetN: number,
  toleranceMeters: number = 0.3,
  distanceUnit: 'm' | 'ft' = 'm'
): StakeoutGuidance {
  const dE = targetE - currentE;
  const dN = targetN - currentN;
  const dist = Math.hypot(dE, dN);
  const targetBearing = (Math.atan2(dE, dN) * (180 / Math.PI) + 360) % 360;
  
  // Normalize heading (default to 0 / North if invalid)
  const safeHeading = isNaN(headingDeg) ? 0 : (headingDeg + 360) % 360;
  
  // Turn angle relative to current orientation (-180 to +180)
  const relativeTurn = ((targetBearing - safeHeading + 540) % 360) - 180;
  const absTurn = Math.abs(relativeTurn);
  
  // Longitudinal (forward/backward) and Lateral (left/right) displacements relative to user heading
  const turnRad = (relativeTurn * Math.PI) / 180;
  const forwardM = dist * Math.cos(turnRad);
  const lateralM = dist * Math.sin(turnRad);
  
  const isOnTarget = dist <= toleranceMeters;
  const isApproaching = dist <= Math.max(1.5, toleranceMeters * 3);
  
  // Unit conversion for speech & display
  const scale = distanceUnit === 'ft' ? 3.28084 : 1.0;
  const unitLabel = distanceUnit === 'ft' ? 'feet' : 'meters';
  const unitAbbr = distanceUnit === 'ft' ? 'ft' : 'm';
  
  const distDisplay = distanceUnit === 'ft' 
    ? `${(dist * scale).toFixed(1)} ft` 
    : dist > 1000 ? `${(dist / 1000).toFixed(2)} km` : `${dist.toFixed(1)} m`;

  let turnDirection: 'left' | 'right' | 'straight' | 'behind' = 'straight';
  if (absTurn > 135) {
    turnDirection = 'behind';
  } else if (relativeTurn < -15) {
    turnDirection = 'left';
  } else if (relativeTurn > 15) {
    turnDirection = 'right';
  }

  const lateralDirection: 'left' | 'right' = lateralM < 0 ? 'left' : 'right';
  
  // Build human-friendly spoken directions
  let spokenInstruction = '';
  let shortVisualInstruction = '';
  
  if (isOnTarget) {
    spokenInstruction = `Target reached. On point within ${toleranceMeters} meters. Stake point now.`;
    shortVisualInstruction = 'ON TARGET • STAKE NOW';
  } else if (dist < 1.0) {
    const dVal = (dist * scale).toFixed(1);
    spokenInstruction = `Very close. Forward ${dVal} ${unitLabel}.`;
    shortVisualInstruction = `Forward ${dVal} ${unitAbbr}`;
  } else {
    // Determine rotation vs forward/lateral phrasing
    const fVal = Math.abs(Math.round(forwardM * scale));
    const lVal = Math.abs(Math.round(lateralM * scale));
    const turnVal = Math.round(absTurn);
    
    if (turnDirection === 'behind') {
      spokenInstruction = `Turn around. Target is ${Math.round(dist * scale)} ${unitLabel} behind you.`;
      shortVisualInstruction = `Turn Around • ${Math.round(dist * scale)} ${unitAbbr} back`;
    } else if (absTurn > 35) {
      const turnTxt = turnDirection === 'left' ? `Turn left ${turnVal} degrees` : `Turn right ${turnVal} degrees`;
      const fwdTxt = fVal > 0 ? `, then walk forward ${Math.round(dist * scale)} ${unitLabel}` : '';
      spokenInstruction = `${turnTxt}${fwdTxt}.`;
      shortVisualInstruction = `${turnDirection === 'left' ? '↰ Turn Left' : '↱ Turn Right'} ${turnVal}° • Walk ${(dist * scale).toFixed(1)} ${unitAbbr}`;
    } else {
      // Facing roughly towards target
      if (lVal >= 1 && fVal >= 1) {
        spokenInstruction = `${lateralDirection} ${lVal} ${unitLabel}, forward ${fVal} ${unitLabel}.`;
        shortVisualInstruction = `${lateralDirection === 'left' ? '← Left' : '→ Right'} ${lVal}${unitAbbr} • Forward ${fVal}${unitAbbr}`;
      } else if (fVal >= 1) {
        spokenInstruction = `Forward ${fVal} ${unitLabel}.`;
        shortVisualInstruction = `↑ Forward ${fVal} ${unitAbbr}`;
      } else {
        spokenInstruction = `${lateralDirection} ${lVal} ${unitLabel}.`;
        shortVisualInstruction = `${lateralDirection === 'left' ? '← Left' : '→ Right'} ${lVal} ${unitAbbr}`;
      }
    }
  }

  return {
    distanceMeters: dist,
    distanceDisplay: distDisplay,
    bearingDeg: Math.round(targetBearing * 10) / 10,
    relativeTurnDeg: Math.round(relativeTurn),
    turnDirection,
    forwardMeters: forwardM,
    lateralMeters: lateralM,
    lateralDirection,
    spokenInstruction,
    shortVisualInstruction,
    isOnTarget,
    isApproaching
  };
}

/**
 * Universal Voice Commander Handler
 */
export type VoiceCommandAction = 
  | { type: 'RECORD_POINT'; remark?: string }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'DELETE_LAST' }
  | { type: 'CLEAR_ALL' }
  | { type: 'START_STAKEOUT'; targetId?: string }
  | { type: 'NEXT_POINT' }
  | { type: 'PREV_POINT' }
  | { type: 'SPEAK_GUIDANCE' }
  | { type: 'TOGGLE_STREAM' }
  | { type: 'CHECK_LEVEL' }
  | { type: 'TARE_LEVEL' }
  | { type: 'LOCK_TARGET' }
  | { type: 'UNLOCK_TARGET' }
  | { type: 'START_PACING' }
  | { type: 'STOP_PACING' }
  | { type: 'OPEN_AR' }
  | { type: 'TOGGLE_TORCH' }
  | { type: 'UNKNOWN'; rawText: string };

export function parseSurveyVoiceCommand(rawTranscript: string): VoiceCommandAction {
  const text = rawTranscript.trim().toLowerCase();
  
  if (text.includes('undo') || text.includes('go back') || text.includes('revert')) {
    return { type: 'UNDO' };
  }
  if (text.includes('redo') || text.includes('repeat')) {
    return { type: 'REDO' };
  }
  if (text.includes('clear all') || text.includes('erase all') || text.includes('reset ledger')) {
    return { type: 'CLEAR_ALL' };
  }
  if (text.includes('delete last') || text.includes('remove last') || text.includes('delete point') || text.includes('trash point')) {
    return { type: 'DELETE_LAST' };
  }
  if (text.includes('tare') || text.includes('zero level') || text.includes('calibrate level') || text.includes('set horizon')) {
    return { type: 'TARE_LEVEL' };
  }
  if (text.includes('unlock') || text.includes('free sight')) {
    return { type: 'UNLOCK_TARGET' };
  }
  if (text.includes('lock target') || text.includes('lock sight') || text.includes('freeze reading') || text.includes('hold reading')) {
    return { type: 'LOCK_TARGET' };
  }
  if (text.includes('start pacing') || text.includes('start step') || text.includes('pedometer start')) {
    return { type: 'START_PACING' };
  }
  if (text.includes('stop pacing') || text.includes('pause pacing') || text.includes('pedometer stop')) {
    return { type: 'STOP_PACING' };
  }
  if (text.includes('open ar') || text.includes('camera') || text.includes('theodolite view') || text.includes('reticle')) {
    return { type: 'OPEN_AR' };
  }
  if (text.includes('record') || text.includes('log point') || text.includes('store') || text.includes('capture') || text.includes('save point') || text.includes('mark point') || text.includes('log observation')) {
    return { type: 'RECORD_POINT', remark: rawTranscript };
  }
  if (text.includes('next point') || text.includes('next target')) {
    return { type: 'NEXT_POINT' };
  }
  if (text.includes('previous point') || text.includes('prev point') || text.includes('last target')) {
    return { type: 'PREV_POINT' };
  }
  if (text.includes('stake') || text.includes('navigate') || text.includes('guide me') || text.includes('find point')) {
    return { type: 'START_STAKEOUT' };
  }
  if (text.includes('where is') || text.includes('distance') || text.includes('tell direction') || text.includes('how far') || text.includes('guidance')) {
    return { type: 'SPEAK_GUIDANCE' };
  }
  if (text.includes('stream') || text.includes('start gps') || text.includes('stop gps') || text.includes('live')) {
    return { type: 'TOGGLE_STREAM' };
  }
  if (text.includes('level') || text.includes('tilt') || text.includes('bubble') || text.includes('incline')) {
    return { type: 'CHECK_LEVEL' };
  }
  if (text.includes('torch') || text.includes('light') || text.includes('flash')) {
    return { type: 'TOGGLE_TORCH' };
  }

  return { type: 'UNKNOWN', rawText: rawTranscript };
}
