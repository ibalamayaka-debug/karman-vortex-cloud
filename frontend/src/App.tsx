import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Cpu,
  Database,
  Flame,
  Gauge,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Sparkles,
  Timer,
  Wind,
} from 'lucide-react';
import { fetchBundle, fetchCachedCases, runKarmanSimulation } from './api';
import { VortexCanvas } from './components/VortexCanvas';
import { detectInitialLang, TRANSLATIONS, type Lang } from './i18n';
import type {
  FieldMode,
  KarmanCaseMeta,
  KarmanParams,
  KarmanResult,
  ObstacleShape,
  PaletteMode,
} from './types';

const SHAPES: ObstacleShape[] = ['cylinder', 'bolte', 'westgate', 'eureka'];

export const App: React.FC = () => {
  const [lang, setLang] = useState<Lang>(detectInitialLang);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [params, setParams] = useState<KarmanParams>({
    shape: 'cylinder',
    reynolds: 150,
    angle_deg: 0,
    wind_speed_ms: 12,
  });
  const [field, setField] = useState<FieldMode>('vorticity');
  const [palette, setPalette] = useState<PaletteMode>('starry');
  const [showBrushstrokes, setShowBrushstrokes] = useState<boolean>(true);
  const [playing, setPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);

  const [result, setResult] = useState<KarmanResult | null>(null);
  const [wasCached, setWasCached] = useState<boolean>(false);
  const [cachedCases, setCachedCases] = useState<KarmanCaseMeta[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    document.title = t.pageTitle;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    try {
      localStorage.setItem('karman_lang', lang);
    } catch {
      // ignore
    }
  }, [lang, t.pageTitle]);

  // Load pre-warmed cloud OpenFOAM cases immediately on first visit
  useEffect(() => {
    (async () => {
      try {
        const list = await fetchCachedCases();
        setCachedCases(list);
        if (list.length > 0) {
          // Prefer classic cylinder first if present
          const preferred = list.find((c) => c.params.shape === 'cylinder') || list[0];
          const bundle = await fetchBundle(preferred.case_key);
          setResult(bundle);
          setParams(bundle.params);
          setWasCached(true);
        }
      } catch {
        // Ignore if empty on very first boot
      }
    })();
  }, []);

  const handleRun = async (override?: KarmanParams) => {
    const target = override ?? params;
    setLoading(true);
    setError('');
    try {
      const resp = await runKarmanSimulation(target);
      setResult(resp.result);
      setParams(resp.result.params);
      setWasCached(resp.cached);
      const list = await fetchCachedCases();
      setCachedCases(list);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const kpis = result?.kpis;
  const timing = result?.timing_sec;

  return (
    <div className={`app-layout ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-top">
            <div className="brand-badge">{t.badge}</div>
            <div className="lang-switch" role="group" aria-label="Language">
              <button
                type="button"
                className={lang === 'zh' ? 'active' : ''}
                onClick={() => setLang('zh')}
              >
                中文
              </button>
              <button
                type="button"
                className={lang === 'en' ? 'active' : ''}
                onClick={() => setLang('en')}
              >
                EN
              </button>
            </div>
          </div>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>

        {/* Section 1: Obstacle / Melbourne Landmark Selector */}
        <section className="panel-section">
          <div className="section-title">
            <Wind size={14} /> {t.sectionObstacle}
          </div>
          <div className="shape-grid">
            {SHAPES.map((sh) => {
              const info = t.shapes[sh];
              const active = params.shape === sh;
              return (
                <button
                  key={sh}
                  type="button"
                  className={`shape-btn ${active ? 'active' : ''}`}
                  onClick={() =>
                    setParams({
                      ...params,
                      shape: sh,
                      angle_deg: sh === 'cylinder' ? 0 : params.angle_deg,
                    })
                  }
                >
                  <strong>{info.name}</strong>
                  <span>{info.sub}</span>
                </button>
              );
            })}
          </div>

          <label className="slider-row">
            <div className="slider-header">
              <span>{t.reynolds}</span>
              <strong>Re = {params.reynolds.toFixed(0)}</strong>
            </div>
            <input
              type="range"
              min={80}
              max={260}
              step={10}
              value={params.reynolds}
              onChange={(e) => setParams({ ...params, reynolds: Number(e.target.value) })}
            />
          </label>

          {params.shape !== 'cylinder' && (
            <label className="slider-row">
              <div className="slider-header">
                <span>{t.angle}</span>
                <strong>{params.angle_deg > 0 ? `+${params.angle_deg}°` : `${params.angle_deg}°`}</strong>
              </div>
              <input
                type="range"
                min={-15}
                max={15}
                step={3}
                value={params.angle_deg}
                onChange={(e) => setParams({ ...params, angle_deg: Number(e.target.value) })}
              />
            </label>
          )}

          <button
            type="button"
            className="run-btn"
            disabled={loading}
            onClick={() => handleRun()}
          >
            <Play size={15} />
            {loading ? t.runningBtn : t.runBtn}
          </button>
        </section>

        {/* Section 2: Van Gogh Starry Night Art & Playback Controls */}
        <section className="panel-section">
          <div className="section-title">
            <Palette size={14} /> {t.sectionArt}
          </div>

          <div className="segmented">
            <button
              type="button"
              className={field === 'vorticity' ? 'active' : ''}
              onClick={() => setField('vorticity')}
            >
              {t.fieldVorticity}
            </button>
            <button
              type="button"
              className={field === 'speed' ? 'active' : ''}
              onClick={() => setField('speed')}
            >
              {t.fieldSpeed}
            </button>
          </div>

          <label className="select-row">
            <span>{t.paletteLabel}</span>
            <select
              value={palette}
              onChange={(e) => setPalette(e.target.value as PaletteMode)}
            >
              <option value="starry">{t.palettes.starry}</option>
              <option value="ember">{t.palettes.ember}</option>
              <option value="scientific">{t.palettes.scientific}</option>
              <option value="inferno">{t.palettes.inferno}</option>
            </select>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={showBrushstrokes}
              onChange={(e) => setShowBrushstrokes(e.target.checked)}
            />
            <span>
              <Sparkles size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              {t.brushstrokes}
            </span>
          </label>

          <label className="slider-row">
            <div className="slider-header">
              <span>{t.playbackSpeed}</span>
              <strong>{playbackSpeed.toFixed(2)}×</strong>
            </div>
            <input
              type="range"
              min={0.25}
              max={2.25}
              step={0.25}
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            />
          </label>
        </section>

        <div className="sidebar-footer">
          <Flame size={13} />
          <span>{t.footerNote}</span>
        </div>
      </aside>

      <main className="workspace">
        <header className="kpi-bar">
          <button
            type="button"
            className="collapse-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? t.hideSidebar : t.showSidebar}
          >
            {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>

          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">
                <Activity size={14} /> {t.kpiStrouhal}
              </div>
              <div className="kpi-value gold">
                {kpis ? `St = ${kpis.strouhal.toFixed(3)}` : '--'}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">
                <Wind size={14} /> {t.kpiCd}
              </div>
              <div className="kpi-value coral">
                {kpis ? kpis.cd_mean.toFixed(2) : '--'}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">
                <Gauge size={14} /> {t.kpiClRms}
              </div>
              <div className="kpi-value">
                {kpis ? kpis.cl_rms.toFixed(3) : '--'}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">
                <Cpu size={14} /> {t.kpiCells}
              </div>
              <div className="kpi-value">
                {kpis ? `${kpis.n_cells.toLocaleString()} · ${kpis.n_frames}f` : '--'}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">
                {wasCached ? <Database size={14} /> : <Timer size={14} />}
                {t.kpiSource}
              </div>
              <div className={`kpi-value ${wasCached ? 'sage' : 'gold'}`}>
                {timing
                  ? wasCached
                    ? t.hitSaved(timing.total.toFixed(1))
                    : `${timing.total.toFixed(1)} s`
                  : '--'}
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div className="error-banner">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        <div className="viewer-wrapper">
          <VortexCanvas
            lang={lang}
            result={result}
            field={field}
            palette={palette}
            showBrushstrokes={showBrushstrokes}
            playing={playing}
            onTogglePlay={() => setPlaying((p) => !p)}
            playbackSpeed={playbackSpeed}
            loading={loading}
          />
        </div>

        {cachedCases.length > 0 && (
          <footer className="presets-strip">
            <span className="strip-label">
              <Database size={13} /> {t.cachedStrip}
            </span>
            <div className="strip-items">
              {cachedCases.map((c) => {
                const active = c.case_key === result?.case_key;
                const shName = t.shapes[c.params.shape]?.name ?? c.params.shape;
                return (
                  <button
                    key={c.case_key}
                    type="button"
                    className={`case-chip ${active ? 'active' : ''}`}
                    onClick={() => handleRun(c.params)}
                  >
                    {shName} · Re={c.params.reynolds}
                    {c.params.angle_deg !== 0 ? ` · ${c.params.angle_deg}°` : ''} · St={c.kpis.strouhal.toFixed(2)}
                  </button>
                );
              })}
            </div>
          </footer>
        )}
      </main>
    </div>
  );
};
