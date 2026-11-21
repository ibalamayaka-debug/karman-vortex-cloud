export type ObstacleShape = 'cylinder' | 'bolte' | 'westgate' | 'eureka';
export type FieldMode = 'vorticity' | 'speed';
export type PaletteMode = 'starry' | 'ember' | 'scientific' | 'inferno';

export interface KarmanParams {
  shape: ObstacleShape;
  reynolds: number;
  angle_deg: number;
  wind_speed_ms: number;
}

export interface KarmanResult {
  case_key: string;
  params: KarmanParams;
  grid: {
    nx: number;
    ny: number;
    vx_sub: number;
    vy_sub: number;
    n_frames: number;
    x_min: number;
    x_max: number;
    y_min: number;
    y_max: number;
    frame_times: number[];
    vort_clip: number;
    speed_max: number;
    vel_clip: number;
  };
  kpis: {
    strouhal: number;
    cd_mean: number;
    cl_rms: number;
    n_cells: number;
    n_frames: number;
    series_t: number[];
    series_cl: number[];
    series_cd: number[];
  };
  timing_sec: {
    mesh: number;
    solve: number;
    postprocess: number;
    total: number;
  };
  payload_kb: number;
  computed_at: string;
  frames_zlib_b64: string;
}

export interface KarmanCaseMeta {
  case_key: string;
  params: KarmanParams;
  kpis: {
    strouhal: number;
    cd_mean: number;
    cl_rms: number;
    n_cells: number;
    n_frames: number;
  };
  timing_sec: {
    total: number;
  };
  payload_kb: number;
  computed_at: string;
}

export interface SimulateResponse {
  status: string;
  cached: boolean;
  backend: string;
  case_key: string;
  remaining_quota?: number;
  result: KarmanResult;
}
