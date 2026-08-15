import { moduleRequest } from '@/lib/api';

export interface UpdateManifest {
  version: string;
  md5: string;
  url: string | null;
  size_bytes: number | null;
  notes: string | null;
}

export interface UpdateStatus {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  ahead: boolean;
  fetch_error: 'network' | 'bad_json' | null;
  manifest: UpdateManifest | null;
  can_upgrade: boolean;
  self_path: string;
  self_writable: boolean;
  tmp_writable: boolean;
}

export interface UpdateRunResult {
  ok: true;
  previous_version: string;
  new_version: string;
}

export const updateApi = {
  status: () => moduleRequest<UpdateStatus>('update', 'status'),
  run: () => moduleRequest<UpdateRunResult>('update', 'run', { method: 'POST' }),
};
