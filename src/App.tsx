import React, { useState, useEffect } from 'react';
import { Navigation, AppTabId } from './components/Navigation';
import { Header } from './components/Header';
import { CommandPalette } from './components/CommandPalette';
import { SettingsModal } from './components/SettingsModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { TourSpotlight } from './components/TourSpotlight';
import { AiGeomaticsModal } from './components/AiGeomaticsModal';
import { downloadBlob } from './lib/zip';

// Tabs
import { HomeTemplatesTab } from './components/HomeTemplatesTab';
import { GisStudioTab } from './components/GisStudioTab';
import { CoordinateConverterTab } from './components/CoordinateConverterTab';
import { GpsSurveyorTab } from './components/GpsSurveyorTab';
import { SurveyCalculatorTab } from './components/SurveyCalculatorTab';
import { FormatConverterTab } from './components/FormatConverterTab';
import { MergeSplitTab } from './components/MergeSplitTab';
import { BoreholeMapperTab } from './components/BoreholeMapperTab';
import { CadastralMapperTab } from './components/CadastralMapperTab';
import { BhunakshaDigitizerTab } from './components/BhunakshaDigitizerTab';
import { BoundaryOffsetTab } from './components/BoundaryOffsetTab';
import { TutorialTab } from './components/TutorialTab';
import { HelpFaqTab } from './components/HelpFaqTab';

export function App() {
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('geo_studio_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Navigation State
  const [activeTab, setActiveTab] = useState<AppTabId>('templates');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Settings State
  const [workingZone, setWorkingZone] = useState<string>(() => {
    return localStorage.getItem('geo_working_zone') || '45N';
  });
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
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);

  // Apply dark mode class to root HTML
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('geo_studio_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('geo_studio_theme', 'light');
    }
  }, [isDarkMode]);

  // Persist settings
  useEffect(() => {
    localStorage.setItem('geo_working_zone', workingZone);
    localStorage.setItem('geo_land_preset', localLandUnitPreset);
    localStorage.setItem('geo_custom_bigha', customBighaM2.toString());
    localStorage.setItem('geo_custom_katha', customKathaPerBigha.toString());
    localStorage.setItem('geo_dist_unit', distanceUnit);
  }, [workingZone, localLandUnitPreset, customBighaM2, customKathaPerBigha, distanceUnit]);

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
      // Ctrl+G or Cmd+G: AI Consultant
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setIsAiModalOpen(prev => !prev);
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
      } catch (err) {
        console.error('Failed to import project file:', err);
      }
    };
    reader.readAsText(file);
  };

  const handleClearAllData = () => {
    localStorage.clear();
    setWorkingZone('45N');
    setLocalLandUnitPreset('bihar_jharkhand');
    setCustomBighaM2(2529.285264);
    setCustomKathaPerBigha(20);
    setDistanceUnit('m');
    setIsDarkMode(true);
    window.location.reload();
  };

  const handleAddFeaturesToGis = (features: any[], layerName: string) => {
    const newLayer = {
      id: `layer_${Date.now()}`,
      name: layerName,
      visible: true,
      color: '#c9a063',
      fillColor: '#c9a063',
      fillOpacity: 0.35,
      strokeWidth: 2,
      geomType: 'point',
      features
    };
    try {
      const existing = JSON.parse(localStorage.getItem('gis_studio_layers') || '[]');
      localStorage.setItem('gis_studio_layers', JSON.stringify([newLayer, ...existing]));
    } catch (err) {}
    setActiveTab('gis');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#d4d4d4] flex flex-col font-sans transition-colors duration-150 selection:bg-[#c9a063]/30 selection:text-[#f5f5f5]">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        isDark={isDarkMode}
        setIsDark={setIsDarkMode}
        openCommandPalette={() => setIsCommandPaletteOpen(true)}
        openSettings={() => setIsSettingsOpen(true)}
        openTour={() => setIsTourOpen(true)}
        setIsMobileOpen={setIsSidebarOpen}
        hasGpsFix={false}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Navigation
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          openSettings={() => setIsSettingsOpen(true)}
          workingZone={workingZone}
        />

        {/* Content View Area */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full custom-scrollbar">
          {activeTab === 'templates' && (
            <HomeTemplatesTab
              setActiveTab={setActiveTab}
              workingZone={workingZone}
              localLandUnitPreset={localLandUnitPreset}
              customBighaM2={customBighaM2}
              customKathaPerBigha={customKathaPerBigha}
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
        </main>
      </div>

      {/* Modals & Overlays */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onOpenTour={() => setIsTourOpen(true)}
        onOpenAi={() => setIsAiModalOpen(true)}
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

      <AiGeomaticsModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        workingZone={workingZone}
        activeTab={activeTab}
      />
    </div>
  );
}

export default App;
