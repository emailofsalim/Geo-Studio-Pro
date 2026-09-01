import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Navigation, AppTabId, APPS_CONFIG } from './components/Navigation';
import { DesktopMenuBar } from './components/DesktopMenuBar';
import { DesktopStatusBar } from './components/DesktopStatusBar';
import { AndroidMobileLayout } from './components/AndroidMobileLayout';
import { CommandPalette } from './components/CommandPalette';
import { SettingsModal } from './components/SettingsModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { TourSpotlight } from './components/TourSpotlight';
import { AboutModal } from './components/AboutModal';
import { AiGeomaticsModal } from './components/AiGeomaticsModal';
import { UniversalDataBridgeModal } from './components/UniversalDataBridgeModal';
import { SensorPrivacyMonitorModal } from './components/SensorPrivacyMonitorModal';
import { ExportFormatId, DetectedImportResult } from './lib/universalDataBridge';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useToast } from './context/ToastContext';
import { useProject } from './context/ProjectContext';
import { downloadBlob } from './lib/zip';
import { saveSessionSnapshot, getLastAutoSaveMeta, loadLatestSessionSnapshot } from './lib/indexedDbStorage';

// Tabs
import { HomeTemplatesTab } from './components/HomeTemplatesTab';
import { FieldSensorsTab } from './components/FieldSensorsTab';
import { GisStudioTab } from './components/GisStudioTab';
import { CoordinateConverterTab } from './components/CoordinateConverterTab';
import { GpsSurveyorTab } from './components/GpsSurveyorTab';
import { SurveyCalculatorTab } from './components/SurveyCalculatorTab';
import { FormatConverterTab } from './components/FormatConverterTab';
import { MergeSplitTab } from './components/MergeSplitTab';
import { BoreholeMapperTab } from './components/BoreholeMapperTab';
import { GeofenceStudioTab } from './components/GeofenceStudioTab';
import { CameraLandmarkStudio } from './components/CameraLandmarkStudio';
import { CadastralMapperTab } from './components/CadastralMapperTab';
import { BhunakshaDigitizerTab } from './components/BhunakshaDigitizerTab';
import { BoundaryOffsetTab } from './components/BoundaryOffsetTab';
import { TutorialTab } from './components/TutorialTab';
import { HelpFaqTab } from './components/HelpFaqTab';
import { crsIdentityFor, isValidZone, DEFAULT_ZONE } from './lib/crsIdentity';

export function App() {
  const toast = useToast();
  const {
    activeProject,
    activeProjectId,
    activeProjectData,
    updateActiveProjectData,
    saveActiveProjectWorkspace,
    updateProject
  } = useProject();

  // Theme State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('geo_studio_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Navigation State
  const [activeTab, setActiveTab] = useState<AppTabId>('templates');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRail, setIsRail] = useState(false);

  // --------------------------------------------------------------------------
  // Working coordinate system
  // --------------------------------------------------------------------------
  // The active project's own CRS is authoritative. The stored preference below
  // is only the seed for a NEW project and the value used when no project is
  // open — it is never allowed to override a project that declares its own zone.
  //
  // This binding is the fix for a defect where the working zone lived purely in
  // global storage: opening a Zone 43 project and then switching to a Zone 45
  // project left every calculation and export running in Zone 43. The
  // arithmetic succeeded and the numbers looked plausible, so the error
  // surfaced only as coordinates in the wrong part of the country.
  const [defaultZonePreference, setDefaultZonePreference] = useState<string>(() => {
    const stored = localStorage.getItem('geo_working_zone');
    return isValidZone(stored) ? (stored as string) : DEFAULT_ZONE;
  });

  // Derived, never stale: changing project changes the working zone in the same render.
  const workingZone = isValidZone(activeProject?.workingZone)
    ? (activeProject!.workingZone as string)
    : defaultZonePreference;

  const setWorkingZone = useCallback(
    (zone: string) => {
      if (!isValidZone(zone)) {
        toast.showError(`"${zone}" is not a valid UTM zone. Expected e.g. "45N" or "43S".`);
        return;
      }
      // Remember as the seed for the next new project.
      setDefaultZonePreference(zone);
      // Persist onto the open project so the change travels with the data.
      if (activeProjectId) {
        const identity = crsIdentityFor(zone);
        updateProject(activeProjectId, { workingZone: identity.zone, crs: identity.label }).catch(
          (err: any) => toast.showError(`Could not save the coordinate system: ${err.message}`)
        );
      }
    },
    [activeProjectId, updateProject, toast]
  );
  const [localLandUnitPreset, setLocalLandUnitPreset] = useState<string>(() => {
    return localStorage.getItem('geo_land_preset') || 'bihar_jharkhand';
  });
  const [customBighaM2, setCustomBighaM2] = useState<number>(() => {
    const s = localStorage.getItem('geo_custom_bigha');
    return s ? parseFloat(s) : 2529.285264;
  });
  const [customKathaPerBigha, setCustomKathaPerBigha] = useState<number>(() => {
    const s = localStorage.getItem('geo_custom_katha');
    return s ? parseFloat(s) : 20;
  });
  const [distanceUnit, setDistanceUnit] = useState<'m' | 'ft'>(() => {
    return (localStorage.getItem('geo_dist_unit') as any) || 'm';
  });

  // Modals
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isAiGeomaticsOpen, setIsAiGeomaticsOpen] = useState(false);
  const [isPrivacyMonitorOpen, setIsPrivacyMonitorOpen] = useState(false);

  // Auto-Save Engine State (IndexedDB)
  const [lastAutoSaveTimeString, setLastAutoSaveTimeString] = useState<string>('');
  const [isAutoSaving, setIsAutoSaving] = useState<boolean>(false);

  // Initialize and check previous IndexedDB auto-save on startup
  useEffect(() => {
    getLastAutoSaveMeta().then(meta => {
      if (meta && meta.timeString) {
        setLastAutoSaveTimeString(meta.timeString);
      }
    });
  }, []);

  // 30-Second Periodic Session Auto-Save to IndexedDB Project Store
  useEffect(() => {
    const runAutoSave = async () => {
      try {
        setIsAutoSaving(true);
        await saveActiveProjectWorkspace();
        const now = new Date().toLocaleTimeString();
        setLastAutoSaveTimeString(now);
      } catch (err) {
        console.warn('Session auto-save error:', err);
      } finally {
        setTimeout(() => setIsAutoSaving(false), 800);
      }
    };

    // Auto-save every 30 seconds (30000 ms)
    const interval = setInterval(runAutoSave, 30000);
    return () => clearInterval(interval);
  }, [saveActiveProjectWorkspace]);

  // Apply dark mode class to root HTML
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('geo_studio_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('geo_studio_theme', 'light');
    }
  }, [isDarkMode]);

  // Persist settings
  useEffect(() => {
    // Only the default-zone preference is global. The live working zone belongs
    // to the open project and is persisted there by setWorkingZone.
    localStorage.setItem('geo_working_zone', defaultZonePreference);
    localStorage.setItem('geo_land_preset', localLandUnitPreset);
    localStorage.setItem('geo_custom_bigha', customBighaM2.toString());
    localStorage.setItem('geo_custom_katha', customKathaPerBigha.toString());
    localStorage.setItem('geo_dist_unit', distanceUnit);
  }, [defaultZonePreference, localLandUnitPreset, customBighaM2, customKathaPerBigha, distanceUnit]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K: Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
      // Ctrl+, or Cmd+,: Settings
      else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen(prev => !prev);
      }
      // Ctrl+/ or Cmd+/: Shortcuts
      else if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setIsShortcutsOpen(prev => !prev);
      }
      // Direct Tab Switching Ctrl+1 through Ctrl+9
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const tabsMap: Record<string, AppTabId> = {
          '1': 'templates',
          '2': 'convert',
          '3': 'gps',
          '4': 'calc',
          '5': 'studio',
          '6': 'merge',
          '7': 'bore',
          '8': 'cad',
          '9': 'offset'
        };
        if (tabsMap[e.key]) {
          e.preventDefault();
          setActiveTab(tabsMap[e.key]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleExportProject = () => {
    try {
      const projectData = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        theme: isDarkMode ? 'dark' : 'light',
        settings: {
          workingZone,
          localLandUnitPreset,
          customBighaM2,
          customKathaPerBigha,
          distanceUnit
        },
        storageDump: { ...localStorage }
      };
      downloadBlob(
        JSON.stringify(projectData, null, 2),
        `geomatics_project_backup_${new Date().toISOString().slice(0, 10)}.json`,
        'application/json'
      );
      toast.showSuccess('Project state and workspace configuration exported successfully.');
    } catch (err: any) {
      toast.showError(`Failed to export project: ${err.message}`);
    }
  };

  const handleImportProject = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);
        if (data.settings) {
          if (data.settings.workingZone) setWorkingZone(data.settings.workingZone);
          if (data.settings.localLandUnitPreset) setLocalLandUnitPreset(data.settings.localLandUnitPreset);
          if (typeof data.settings.customBighaM2 === 'number') setCustomBighaM2(data.settings.customBighaM2);
          if (typeof data.settings.customKathaPerBigha === 'number') setCustomKathaPerBigha(data.settings.customKathaPerBigha);
          if (data.settings.distanceUnit) setDistanceUnit(data.settings.distanceUnit);
        }
        if (data.theme) {
          setIsDarkMode(data.theme === 'dark');
        }
        if (data.storageDump && typeof data.storageDump === 'object') {
          Object.entries(data.storageDump).forEach(([k, v]) => {
            if (typeof v === 'string') {
              localStorage.setItem(k, v);
            }
          });
        }
        toast.showSuccess(`Project restored successfully from ${file.name}`);
      } catch (err: any) {
        toast.showError(`Failed to import project file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleClearAllData = () => {
    localStorage.clear();
    setDefaultZonePreference(DEFAULT_ZONE);
    setLocalLandUnitPreset('bihar_jharkhand');
    setCustomBighaM2(2529.285264);
    setCustomKathaPerBigha(20);
    setDistanceUnit('m');
    setIsDarkMode(true);
    toast.showInfo('Reset all workspace settings and caches.');
    setTimeout(() => window.location.reload(), 600);
  };

  const handleAddFeaturesToGis = (features: any[], layerName: string) => {
    const projId = activeProjectId || 'project_pakhar_2026';
    const newLayer = {
      id: `layer_${Date.now()}`,
      projectId: projId,
      name: layerName,
      visible: true,
      color: '#c9a063',
      fillColor: '#c9a063',
      fillOpacity: 0.35,
      strokeWidth: 2,
      geomType: 'point' as const,
      features: features.map(f => ({ ...f, projectId: projId }))
    };
    try {
      updateActiveProjectData(old => ({
        ...old,
        layers: [newLayer, ...(old.layers || [])]
      }));
      toast.showSuccess(`Transferred ${features.length} feature(s) to GIS Studio layer "${layerName}".`);
    } catch (err: any) {
      toast.showError(`Could not send features to GIS: ${err.message}`);
    }
    setActiveTab('gis');
  };

  // Universal Data Bridge Modal State (Import / Export across all apps)
  const [isUniversalBridgeOpen, setIsUniversalBridgeOpen] = useState(false);
  const [universalBridgeMode, setUniversalBridgeMode] = useState<'import' | 'export'>('export');
  const [universalBridgeFormat, setUniversalBridgeFormat] = useState<ExportFormatId>('geojson');

  const openUniversalImport = () => {
    setUniversalBridgeMode('import');
    setIsUniversalBridgeOpen(true);
  };

  const openUniversalExport = (format?: ExportFormatId) => {
    setUniversalBridgeMode('export');
    if (format) setUniversalBridgeFormat(format);
    setIsUniversalBridgeOpen(true);
  };

  const handleUniversalImportComplete = (result: DetectedImportResult, destinationApp: string) => {
    const projId = activeProjectId || 'project_pakhar_2026';
    if (destinationApp === 'gis' || destinationApp === 'studio') {
      try {
        const newLayer = {
          id: `layer_${Date.now()}`,
          projectId: projId,
          name: result.formatName + ' (' + result.features.length + ' pts)',
          visible: true,
          color: '#c9a063',
          fillColor: '#c9a063',
          fillOpacity: 0.35,
          strokeWidth: 2,
          geomType: (result.polygonsCount > 0 ? 'polygon' : result.linesCount > 0 ? 'line' : 'point') as any,
          features: result.features.map(f => ({ ...f, projectId: projId }))
        };
        updateActiveProjectData(old => ({
          ...old,
          layers: [newLayer, ...(old.layers || [])]
        }));
        toast.showSuccess(`Imported ${result.featureCount} feature(s) into GIS Studio layer!`);
        setActiveTab('gis');
      } catch (err: any) {
        toast.showError(`Import error: ${err.message}`);
      }
    } else if (destinationApp === 'gps') {
      try {
        const newWps = result.features.map((f, i) => {
          const pt = f.pts[0] || { a: 0, b: 0 };
          return {
            id: f.name || `PT-${i + 1}`,
            projectId: projId,
            code: (f.props?.code as string) || 'Imported Target',
            E: (f.props?.utmE as number) || (f.kind === 'en' ? pt.a : 0),
            N: (f.props?.utmN as number) || (f.kind === 'en' ? pt.b : 0),
            Z: (f.props?.elevation as number) || (f.props?.Z as number) || 0,
            lat: f.kind === 'll' ? pt.b : 0,
            lon: f.kind === 'll' ? pt.a : 0,
            acc: 1.0,
            zone: workingZone,
            time: Date.now(),
            remarks: f.props ? JSON.stringify(f.props) : undefined,
            proximityRadius: 5
          };
        });
        updateActiveProjectData(old => ({
          ...old,
          waypoints: [...(old.waypoints || []), ...newWps]
        }));
        toast.showSuccess(`Added ${newWps.length} target waypoint(s) to GNSS Field Surveyor!`);
        setActiveTab('gps');
      } catch (err: any) {
        toast.showError(`Import error: ${err.message}`);
      }
    } else if (destinationApp === 'cad') {
      try {
        const newParcels = result.features.filter(f => f.geom === 'polygon' || f.pts.length >= 3).map((f, i) => ({
          id: `parcel_${Date.now()}_${i}`,
          projectId: projId,
          khasra: f.name || `${i + 101}`,
          owner: (f.props?.owner as string) || (f.props?.Owner as string) || 'Imported Landowner',
          village: (f.props?.village as string) || 'Surveyed Mouza',
          status: 'verified',
          areaM2: (f.props?.areaSqm as number) || 1000,
          areaHa: ((f.props?.areaSqm as number) || 1000) / 10000,
          areaAcres: (((f.props?.areaSqm as number) || 1000) / 10000) * 2.47105,
          pts: f.pts.map(p => ({
            E: f.kind === 'en' ? p.a : 0,
            N: f.kind === 'en' ? p.b : 0
          }))
        }));
        if (newParcels.length > 0) {
          updateActiveProjectData(old => ({
            ...old,
            parcels: [...(old.parcels || []), ...newParcels]
          }));
          toast.showSuccess(`Added ${newParcels.length} parcel(s) to Cadastral Mapper!`);
        } else {
          toast.showInfo(`Loaded ${result.featureCount} spatial geometries.`);
        }
        setActiveTab('cad');
      } catch (err: any) {
        toast.showError(`Import error: ${err.message}`);
      }
    } else {
      setActiveTab((destinationApp as AppTabId) || 'gis');
    }
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-[#0a0a0a] text-[#d4d4d4]' : 'bg-[#f8fafc] text-[#1e293b]'} flex flex-col font-sans transition-colors duration-150 selection:bg-[#c9a063]/30 selection:text-[#f5f5f5]`}>
      {/* 1. Desktop Workstation Top Menu Bar & Ribbon (Desktop Only) */}
      <DesktopMenuBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        workingZone={workingZone}
        setWorkingZone={setWorkingZone}
        distanceUnit={distanceUnit}
        setDistanceUnit={setDistanceUnit}
        isDark={isDarkMode}
        setIsDark={setIsDarkMode}
        openCommandPalette={() => setIsCommandPaletteOpen(true)}
        openSettings={() => setIsSettingsOpen(true)}
        openShortcuts={() => setIsShortcutsOpen(true)}
        openTour={() => setIsTourOpen(true)}
        openAbout={() => setIsAboutOpen(true)}
        openAiCopilot={() => setIsAiGeomaticsOpen(true)}
        openUniversalImport={openUniversalImport}
        openUniversalExport={openUniversalExport}
        onExportProject={handleExportProject}
        onImportProject={handleImportProject}
        onClearAllData={handleClearAllData}
        hasGpsFix={false}
      />

      {/* 2. Android Mobile Native Header & Telemetry (Mobile Only) */}
      <AndroidMobileLayout
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        workingZone={workingZone}
        setWorkingZone={setWorkingZone}
        openCommandPalette={() => setIsCommandPaletteOpen(true)}
        openSettings={() => setIsSettingsOpen(true)}
        openAiCopilot={() => setIsAiGeomaticsOpen(true)}
        openUniversalImport={openUniversalImport}
        openUniversalExport={openUniversalExport}
        hasGpsFix={false}
        isDark={isDarkMode}
        setIsDark={setIsDarkMode}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Collapsible Sidebar */}
        <Navigation
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isRail={isRail}
          setIsRail={setIsRail}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          openSettings={() => setIsSettingsOpen(true)}
          openUniversalImport={openUniversalImport}
          openUniversalExport={openUniversalExport}
          workingZone={workingZone}
        />

        {/* Content View Area */}
        <main className="flex-1 p-3 sm:p-5 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full custom-scrollbar pb-24 md:pb-6">
          <ErrorBoundary fallbackTitle={`Error rendering ${activeTab} workspace`}>
            {activeTab === 'templates' && (
              <HomeTemplatesTab
                setActiveTab={setActiveTab}
                workingZone={workingZone}
                localLandUnitPreset={localLandUnitPreset}
                customBighaM2={customBighaM2}
                customKathaPerBigha={customKathaPerBigha}
              />
            )}

            {(activeTab === 'sensors' || activeTab === 'sensor' || activeTab === 'theodolite' || activeTab === 'level') && (
              <FieldSensorsTab
                workingZone={workingZone}
                distanceUnit={distanceUnit}
                onSendToGisLayers={handleAddFeaturesToGis}
              />
            )}

            {activeTab === 'gis' && (
              <GisStudioTab
                workingZone={workingZone}
                localLandUnitPreset={localLandUnitPreset}
                customBighaM2={customBighaM2}
                customKathaPerBigha={customKathaPerBigha}
              />
            )}

            {(activeTab === 'geofence' || activeTab === 'gf') && (
              <GeofenceStudioTab
                workingZone={workingZone}
                onSendToGis={(features) => handleAddFeaturesToGis(features, 'Geofence Boundaries')}
              />
            )}

            {(activeTab === 'camera' || activeTab === 'cam' || activeTab === 'photo') && (
              <CameraLandmarkStudio
                workingZone={workingZone}
                onSendToGisLayers={handleAddFeaturesToGis}
              />
            )}

            {activeTab === 'convert' && (
              <CoordinateConverterTab
                workingZone={workingZone}
                setWorkingZone={setWorkingZone}
              />
            )}

            {activeTab === 'gps' && (
              <GpsSurveyorTab
                workingZone={workingZone}
                distanceUnit={distanceUnit}
              />
            )}

            {activeTab === 'calc' && (
              <SurveyCalculatorTab
                workingZone={workingZone}
                localLandUnitPreset={localLandUnitPreset}
                customBighaM2={customBighaM2}
                customKathaPerBigha={customKathaPerBigha}
                onSendToGisLayers={handleAddFeaturesToGis}
              />
            )}

            {activeTab === 'studio' && (
              <FormatConverterTab workingZone={workingZone} />
            )}

            {(activeTab === 'combine' || activeTab === 'merge') && (
              <MergeSplitTab workingZone={workingZone} />
            )}

            {activeTab === 'bore' && (
              <BoreholeMapperTab workingZone={workingZone} />
            )}

            {(activeTab === 'bhunaksha' || activeTab === 'digitize') && (
              <BhunakshaDigitizerTab
                workingZone={workingZone}
                localLandUnitPreset={localLandUnitPreset}
                customBighaM2={customBighaM2}
                customKathaPerBigha={customKathaPerBigha}
              />
            )}

            {activeTab === 'cad' && (
              <CadastralMapperTab
                workingZone={workingZone}
                localLandUnitPreset={localLandUnitPreset}
                customBighaM2={customBighaM2}
                customKathaPerBigha={customKathaPerBigha}
              />
            )}

            {(activeTab === 'off' || activeTab === 'offset') && (
              <BoundaryOffsetTab
                workingZone={workingZone}
                localLandUnitPreset={localLandUnitPreset}
                customBighaM2={customBighaM2}
                customKathaPerBigha={customKathaPerBigha}
              />
            )}

            {(activeTab === 'tut' || activeTab === 'tutorials') && (
              <TutorialTab setActiveTab={setActiveTab} />
            )}

            {(activeTab === 'help' || activeTab === 'faq') && <HelpFaqTab />}
          </ErrorBoundary>
        </main>
      </div>

      {/* 3. Desktop Workstation Bottom Status Bar (Desktop Only) */}
      <DesktopStatusBar
        workingZone={workingZone}
        distanceUnit={distanceUnit}
        activeTab={activeTab}
        lastAutoSaveTime={lastAutoSaveTimeString}
        isAutoSaving={isAutoSaving}
        onOpenPrivacyMonitor={() => setIsPrivacyMonitorOpen(true)}
      />

      {/* Modals & Overlays */}
      <SensorPrivacyMonitorModal
        isOpen={isPrivacyMonitorOpen}
        onClose={() => setIsPrivacyMonitorOpen(false)}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onOpenTour={() => setIsTourOpen(true)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        workingZone={workingZone}
        setWorkingZone={setWorkingZone}
        isDark={isDarkMode}
        setIsDark={setIsDarkMode}
        localLandUnitPreset={localLandUnitPreset}
        setLocalLandUnitPreset={setLocalLandUnitPreset}
        customBighaM2={customBighaM2}
        setCustomBighaM2={setCustomBighaM2}
        customKathaPerBigha={customKathaPerBigha}
        setCustomKathaPerBigha={setCustomKathaPerBigha}
        distanceUnit={distanceUnit}
        setDistanceUnit={setDistanceUnit}
        onExportProject={handleExportProject}
        onImportProject={handleImportProject}
        onClearAllData={handleClearAllData}
      />

      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      <TourSpotlight
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        setActiveTab={setActiveTab}
      />

      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

      <AiGeomaticsModal
        isOpen={isAiGeomaticsOpen}
        onClose={() => setIsAiGeomaticsOpen(false)}
        workingZone={workingZone}
        activeTab={activeTab}
      />

      {/* Universal Data Bridge (Import Auto-Detect & Export Format Chooser) */}
      <UniversalDataBridgeModal
        isOpen={isUniversalBridgeOpen}
        onClose={() => setIsUniversalBridgeOpen(false)}
        initialMode={universalBridgeMode}
        activeAppId={activeTab}
        activeAppName={(Array.isArray(APPS_CONFIG) ? APPS_CONFIG.find(a => a.id === activeTab)?.name : undefined) || activeTab}
        workingZone={workingZone}
        onImportComplete={handleUniversalImportComplete}
      />
    </div>
  );
}

export default App;
