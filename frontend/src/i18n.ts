export type Lang = 'zh' | 'en';

export function detectInitialLang(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (q === 'zh' || q === 'en') return q;
    const saved = localStorage.getItem('karman_lang');
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // ignore
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }
  return 'zh';
}

export const TRANSLATIONS = {
  zh: {
    pageTitle: '卡门涡街云仿真实验室 — 墨尔本地标与梵高星空涡旋',
    badge: 'OpenFOAM icoFoam · Modal 云端瞬态求解',
    title: '卡门涡街云仿真',
    subtitle: '气流掠过圆柱与墨尔本桥梁/地标断面，拖出《星空》般的周期涡旋',
    sectionObstacle: '障碍物 / 墨尔本地标断面',
    shapes: {
      cylinder: { name: '经典圆柱', sub: '标准卡门涡街 St≈0.19' },
      bolte: { name: 'Bolte Bridge', sub: '墨尔本双塔桥墩截面' },
      westgate: { name: 'West Gate Bridge', sub: '西门大桥梯形箱梁' },
      eureka: { name: 'Eureka Tower', sub: '尤里卡大厦切角方柱' },
    },
    reynolds: '雷诺数 Re',
    angle: '来流攻角 α',
    runBtn: '云端 OpenFOAM 实时求解',
    runningBtn: 'Modal 云端求解 48 帧中...',
    sectionArt: '艺术风格与动画控制',
    fieldVorticity: '涡量 ωz（旋转涡旋）',
    fieldSpeed: '流速场 |U|',
    paletteLabel: '色彩风格',
    palettes: {
      starry: '梵高《星空》Starry Night',
      ember: '暖焰琥珀 Warm Ember',
      scientific: '科学双极 Cool-to-Warm',
      inferno: '炽热熔岩 Inferno',
    },
    brushstrokes: '梵高星空流光笔触粒子',
    playbackSpeed: '动画播放倍速',
    pause: '暂停',
    play: '播放',
    footerNote: '100% 云端 OpenFOAM 瞬态计算 · 结果自动缓存至 Cloudflare KV',
    kpiStrouhal: '斯特劳哈尔数 St',
    kpiCd: '平均阻力系数 CD',
    kpiClRms: '涡激升力脉动 CL,rms',
    kpiCells: '网格 / 动画帧',
    kpiSource: '云端耗时 / 缓存',
    hitSaved: (s: string) => `KV 秒开 (省 ${s}s)`,
    cachedStrip: '云端已缓存涡街算例（0ms 秒开）：',
    waveTitle: 'OpenFOAM 实时涡激升力振荡曲线 CL(t)',
    loadingTitle: '正在 Modal 云端运行 OpenFOAM 瞬态 icoFoam...',
    loadingDesc: '划分正交 2D 网格 → 推进 1,200 瞬态步 → 抽取 48 帧涡量场与 FFT 频率',
    emptyTitle: '选择左侧墨尔本地标或圆柱，点击“云端 OpenFOAM 实时求解”',
    colorbarVort: '无量纲涡量 ωz（逆时针金黄 ↔ 顺时针深蓝）',
    colorbarSpeed: '无量纲流速 |U| / U∞',
    hideSidebar: '收起侧边栏',
    showSidebar: '展开侧边栏',
  },
  en: {
    pageTitle: 'Kármán Vortex Street Cloud Lab — Melbourne Landmarks & Starry Night CFD',
    badge: 'OpenFOAM icoFoam · Modal Cloud Transient',
    title: 'Kármán Vortex Cloud',
    subtitle: 'Transient vortex shedding behind cylinders & Melbourne bridge/tower sections',
    sectionObstacle: 'Obstacle / Melbourne Landmark Section',
    shapes: {
      cylinder: { name: 'Circular Cylinder', sub: 'Classic Vortex Street St≈0.19' },
      bolte: { name: 'Bolte Bridge', sub: 'Melbourne Twin-Pylon Section' },
      westgate: { name: 'West Gate Bridge', sub: 'Trapezoidal Box-Girder Deck' },
      eureka: { name: 'Eureka Tower', sub: 'Chamfered Skyscraper Section' },
    },
    reynolds: 'Reynolds Number Re',
    angle: 'Angle of Attack α',
    runBtn: 'Run Cloud OpenFOAM',
    runningBtn: 'Solving 48 Frames on Modal...',
    sectionArt: 'Visual Style & Playback',
    fieldVorticity: 'Vorticity ωz (Swirls)',
    fieldSpeed: 'Velocity Speed |U|',
    paletteLabel: 'Color Palette',
    palettes: {
      starry: 'Van Gogh — Starry Night',
      ember: 'Warm Ember & Gold',
      scientific: 'ParaView Cool-to-Warm',
      inferno: 'Inferno Plasma',
    },
    brushstrokes: 'Starry Night Flowing Brushstrokes',
    playbackSpeed: 'Animation Speed',
    pause: 'Pause',
    play: 'Play',
    footerNote: '100% Cloud OpenFOAM icoFoam · Cached globally on Cloudflare KV',
    kpiStrouhal: 'Strouhal Number St',
    kpiCd: 'Mean Drag Coeff CD',
    kpiClRms: 'Lift Oscillation CL,rms',
    kpiCells: '2D Mesh / Frames',
    kpiSource: 'Cloud Solve / Cache',
    hitSaved: (s: string) => `KV HIT (${s}s saved)`,
    cachedStrip: 'Cloud Cached Vortex Streets (Instant Load):',
    waveTitle: 'OpenFOAM Vortex-Induced Lift Oscillation CL(t)',
    loadingTitle: 'Running Transient OpenFOAM icoFoam on Modal Cloud...',
    loadingDesc: '2D Orthogonal Mesh → 1,200 PISO Time Steps → 48 Vorticity Frames + FFT',
    emptyTitle: 'Choose a Melbourne landmark or cylinder and click "Run Cloud OpenFOAM"',
    colorbarVort: 'Dimensionless Vorticity ωz (CCW Gold ↔ CW Indigo)',
    colorbarSpeed: 'Dimensionless Speed |U| / U∞',
    hideSidebar: 'Hide sidebar',
    showSidebar: 'Show sidebar',
  },
} as const;
