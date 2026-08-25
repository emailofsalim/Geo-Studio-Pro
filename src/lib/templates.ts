import { toCSVtext, csvEnc } from './formats';
import { makeZip, ZipFileEntry } from './zip';
import { BORE_PRESETS } from './mineProfiles';

export interface TemplateDefinition {
  cols: string[];
  ex: string[][];
  description: string;
}

export const TEMPLATES: Record<string, TemplateDefinition> = {
  convert: {
    cols: ['Name', 'Longitude', 'Latitude', 'Easting', 'Northing'],
    ex: [
      ['P1', '84.600000', '23.530000', '', ''],
      ['P2', '84.610000', '23.540000', '', ''],
      ['P3', '84.625000', '23.552500', '', ''],
      ['P4', '', '', '254900.00', '2605250.00'],
      ['P5', '', '', '255120.00', '2605540.00']
    ],
    description: 'Coordinate conversion batch file. Fill either Lon/Lat or UTM E/N.'
  },
  point: {
    cols: ['Name', 'Longitude', 'Latitude', 'Easting', 'Northing', 'Description'],
    ex: [
      ['Mine Office', '84.605000', '23.532000', '', '', 'Main Admin Block'],
      ['Explosive Store', '84.606200', '23.533100', '', '', 'Safety Magazine'],
      ['Weighbridge', '84.607500', '23.534500', '', '', 'In-motion 100T Scale'],
      ['Main Gate', '', '', '254900.00', '2605250.00', 'Security Checkpoint (UTM)'],
      ['Magazine', '', '', '255010.00', '2605410.00', 'Blasting Explosive Store']
    ],
    description: 'Generic survey points with description and attributes.'
  },
  text: {
    cols: ['Name', 'Longitude', 'Latitude', 'Easting', 'Northing'],
    ex: [
      ['PBH-01', '84.619700', '23.556300', '', ''],
      ['PBH-02', '84.620100', '23.556700', '', ''],
      ['RL 1095.84', '', '', '254411.97', '2605835.06'],
      ['RL 1092.40', '', '', '254498.10', '2605902.55']
    ],
    description: 'Text labels plotted on coordinates without pushpins.'
  },
  bp: {
    cols: ['Name', 'Longitude', 'Latitude', 'Easting', 'Northing', 'Pillar_Type', 'Remarks'],
    ex: [
      ['BP-01', '84.601000', '23.533000', '', '', 'Boundary', 'RCC pillar'],
      ['BP-02', '84.601800', '23.533600', '', '', 'Boundary', 'RCC pillar'],
      ['BP-03', '84.602600', '23.534200', '', '', 'Boundary', 'Painted rock'],
      ['BP-04', '', '', '254820.50', '2605180.30', 'Boundary', 'UTM Station A'],
      ['BP-05', '', '', '254905.20', '2605240.80', 'Boundary', 'UTM Station B']
    ],
    description: 'Mining lease boundary pillars with type and notes.'
  },
  borehole: {
    cols: ['BH_ID', 'Lease', 'Longitude', 'Latitude', 'Collar_RL', 'EOH', 'From_m', 'To_m', 'Lithology', 'Al2O3', 'SiO2', 'TAA'],
    ex: [
      ['BH-01', 'Pakhar 15.58 Ha', '84.601700', '23.535200', '1061.1', '11.5', '0.00', '2.00', 'Soil', '', '', ''],
      ['BH-01', 'Pakhar 15.58 Ha', '84.601700', '23.535200', '1061.1', '11.5', '2.00', '9.50', 'Laterite', '24.5', '9.1', ''],
      ['BH-01', 'Pakhar 15.58 Ha', '84.601700', '23.535200', '1061.1', '11.5', '9.50', '11.50', 'Bauxite', '41.83', '1.87', '44.1'],
      ['BH-02', 'Pakhar 15.58 Ha', '84.602300', '23.536100', '1063.4', '13.0', '0.00', '1.50', 'Soil', '', '', ''],
      ['BH-02', 'Pakhar 15.58 Ha', '84.602300', '23.536100', '1063.4', '13.0', '1.50', '8.00', 'Bauxite', '38.20', '3.40', '40.5'],
      ['BH-02', 'Pakhar 15.58 Ha', '84.602300', '23.536100', '1063.4', '13.0', '8.00', '10.00', 'Lithomarge', '29.10', '8.60', ''],
      ['BH-02', 'Pakhar 15.58 Ha', '84.602300', '23.536100', '1063.4', '13.0', '10.00', '13.00', 'Bauxite', '36.90', '2.10', '37.2']
    ],
    description: 'Exploration borehole core intervals with assay grades.'
  },
  cad_geometry: {
    cols: ['Plot', 'Longitude', 'Latitude'],
    ex: [
      ['2048', '84.601557', '23.541563'], ['2048', '84.601654', '23.541780'], ['2048', '84.601730', '23.542031'],
      ['2048', '84.601795', '23.542201'], ['2048', '84.601492', '23.542286'], ['2048', '84.601401', '23.542307'],
      ['2050', '84.601795', '23.542201'], ['2050', '84.601838', '23.542326'], ['2050', '84.601846', '23.542384'],
      ['2050', '84.601401', '23.542307'], ['2050', '84.601492', '23.542286']
    ],
    description: 'Cadastral parcel vertices grouped by Plot number.'
  },
  cad_land: {
    cols: ['Plot', 'Village', 'Thana', 'ThanaNo', 'District', 'State', 'Khata', 'Part_Whole', 'Land_Class', 'Owner', 'Ownership', 'Lease'],
    ex: [
      ['2048', 'Pakhar', 'Kisko', '104', 'Lohardaga', 'Jharkhand', '18', 'Part', 'Tanr II', 'Kaisu Asur', 'Raiyati', 'Pakhar 115.13 Ha'],
      ['2050', 'Pakhar', 'Kisko', '104', 'Lohardaga', 'Jharkhand', '54', 'Part', 'Tanr II', 'Budhwa Oraon', 'Raiyati', 'Pakhar 115.13 Ha'],
      ['2047', 'Pakhar', 'Kisko', '104', 'Lohardaga', 'Jharkhand', '112', 'Whole', 'Tanr II', 'Sukra Munda', 'Raiyati', 'Pakhar 115.13 Ha']
    ],
    description: 'Cadastral land records linked to plot geometry.'
  },
  ml_boundary: {
    cols: ['Name', 'Longitude', 'Latitude'],
    ex: [
      ['ML_15.58', '84.594000', '23.543900'],
      ['ML_15.58', '84.603100', '23.536700'],
      ['ML_15.58', '84.603200', '23.540700'],
      ['ML_15.58', '84.596300', '23.542600'],
      ['ML_15.58', '84.594300', '23.544300']
    ],
    description: 'Lease boundary polygon vertices for offset / safety belt calculations.'
  },
  polygon: {
    cols: ['Name', 'Longitude', 'Latitude', 'Easting', 'Northing', 'Description'],
    ex: [
      ['Office Block', '', '', '254799.60', '2605291.00', 'Corner 1'],
      ['Office Block', '', '', '254952.30', '2605187.00', 'Corner 2'],
      ['Office Block', '', '', '254946.80', '2605408.00', 'Corner 3'],
      ['Office Block', '', '', '254799.60', '2605291.00', 'Corner 4 (Closed)']
    ],
    description: 'Closed polygon zone. Consecutive vertices with the same name.'
  },
  line: {
    cols: ['Name', 'Longitude', 'Latitude', 'Easting', 'Northing', 'Description'],
    ex: [
      ['Haul-Road', '', '', '254700.00', '2605100.00', 'Start Station'],
      ['Haul-Road', '', '', '254850.00', '2605300.00', 'Mid Turn'],
      ['Haul-Road', '', '', '255000.00', '2605150.00', 'Pit Incline End']
    ],
    description: 'Survey line / road centerline / pipeline path.'
  }
};

export const DATA_DICTIONARY = [
  { template: 'common', col: 'Name / ID', desc: 'Unique identifier for the feature or station.' },
  { template: 'common', col: 'Longitude', desc: 'WGS84 longitude in decimal degrees (-180 to 180).' },
  { template: 'common', col: 'Latitude', desc: 'WGS84 latitude in decimal degrees (-90 to 90).' },
  { template: 'common', col: 'Easting', desc: 'UTM Projected Easting coordinate in metres.' },
  { template: 'common', col: 'Northing', desc: 'UTM Projected Northing coordinate in metres.' },
  { template: 'common', col: 'Collar_RL', desc: 'Elevation / Reduced Level (RL) in metres above MSL.' },
  { template: 'borehole', col: 'BH_ID', desc: 'Unique hole designation (e.g. BH-01).' },
  { template: 'borehole', col: 'From_m / To_m', desc: 'Depth interval from collar top to base in metres.' },
  { template: 'borehole', col: 'Lithology', desc: 'Geological rock / stratum classification (e.g. Bauxite, Laterite).' },
  { template: 'borehole', col: 'Al2O3 / SiO2 / Fe2O3', desc: 'Chemical assay grades in weight percent (%).' },
  { template: 'cadastral', col: 'Plot', desc: 'Revenue plot / parcel survey number.' },
  { template: 'cadastral', col: 'Khata', desc: 'Revenue account / holding number.' },
  { template: 'cadastral', col: 'Owner / Ownership', desc: 'Name of the land owner / raiyat and legal tenure type.' }
];

export function buildAllTemplatesZip(): Uint8Array {
  const files: ZipFileEntry[] = [];
  Object.keys(TEMPLATES).forEach(k => {
    const t = TEMPLATES[k];
    const csvContent = toCSVtext(t.cols, t.ex);
    files.push({ name: `template_${k}.csv`, data: csvEnc(csvContent) });
  });

  // Add sample profile templates
  Object.keys(BORE_PRESETS).forEach(pk => {
    const p = BORE_PRESETS[pk];
    const cols = ['BH_ID', 'Lease', 'Longitude', 'Latitude', 'Collar_RL', 'EOH', 'From_m', 'To_m', 'Lithology', ...p.params.map(pm => pm.key)];
    const sampleRow = ['BH-01', p.name, '84.601650', '23.535200', '1061.0', '12.0', '0.00', '4.50', 'Ore', ...p.params.map(() => '35.0')];
    files.push({ name: `borehole_${p.name.toLowerCase().replace(/\s+/g, '_')}.csv`, data: csvEnc(toCSVtext(cols, [sampleRow])) });
  });

  return makeZip(files);
}
