import { GeoFeature, GisLayer, TopologyIssue } from '../../types';

export type GisTool =
  | 'pan'
  | 'select'
  | 'edit_vertex'
  | 'draw_point'
  | 'draw_line'
  | 'draw_poly'
  | 'measure';

export interface SelectedFeatureRef {
  layerId: string;
  featureIdx: number;
  feature: GeoFeature;
}

export interface SnapTarget {
  E: number;
  N: number;
  type: 'vertex' | 'midpoint' | 'grid';
  sourceFeatureName?: string;
  distancePx: number;
}

export interface VertexDragState {
  layerId: string;
  featureIdx: number;
  vertexIdx: number;
  startE: number;
  startN: number;
  currE: number;
  currN: number;
}

export interface FeatureMoveState {
  layerId: string;
  featureIdx: number;
  startMouseE: number;
  startMouseN: number;
  originalPts: { a: number; b: number }[];
}

export interface MidpointHandle {
  layerId: string;
  featureIdx: number;
  insertAfterIdx: number;
  E: number;
  N: number;
}

export interface HistorySnapshot {
  layers: GisLayer[];
  description: string;
}
