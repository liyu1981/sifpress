import { apiRequest, migrationRequest, uploadRequest } from '@/lib/api';

export type PageStatus = 'draft' | 'published';

/**
 * Reserved slug served by the backend as a virtual page (the markdown
 * syntax reference, see src/demo_page.php). Matches DEMO_PAGE_SLUG in
 * the PHP fragment.
 */
export const DEMO_PAGE_SLUG = 'sifpress-markdown-syntax';

export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  name: string;
  has_avatar: boolean;
  avatar_url: string;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
  roles: string[];
  permissions: string[];
}

export interface Page {
  id: number;
  slug: string;
  title: string;
  content_md: string;
  tags: string[];
  status: PageStatus;
  created_by: number | null;
  created_by_name: string;
  updated_by: number | null;
  updated_by_name: string;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
}

export interface PageListItem {
  id: number;
  slug: string;
  title: string;
  content_md: string;
  tags: string[];
  status: PageStatus;
  created_by: number | null;
  created_by_name: string;
  updated_at: string;
  can_edit: boolean;
}

export interface SearchResult {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  status: PageStatus;
  created_by_name: string;
  updated_at: string;
  can_edit: boolean;
}

export interface UserListItem {
  id: number;
  username: string;
  email: string | null;
  name: string;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
  roles: string[];
}

export interface RoleListItem {
  id: number;
  code: string;
  name: string;
  description: string;
  permissions: string[];
}

export interface Grant {
  username: string;
  name: string;
  granted_by_name: string | null;
  created_at: string | null;
  permission: 'edit' | 'view';
  note: string | null;
  kind: 'owner' | 'admin' | 'grant';
}

export interface SystemStatus {
  name: string;
  api: boolean;
  migrate_required: boolean;
  version: string[];
  latest: string[];
  asset_limits: {
    image_max_bytes: number;
    video_max_bytes: number;
    thumb_max_bytes: number;
  };
}

export interface MigrationStatus {
  migrate_required: boolean;
  version: string[];
  latest: string[];
  migrations: { version: string; applied: boolean }[];
}

export interface MigrationRunResult {
  applied: string[];
  latest: string[];
  migrate_required: false;
}

export interface PageListResult {
  items: PageListItem[];
  total: number;
  page: number;
  per_page: number;
}

export interface SearchResultSet {
  items: SearchResult[];
  total: number;
}

export interface PageInput {
  slug: string;
  title: string;
  content_md: string;
  status: PageStatus;
  created_at?: string;
  updated_at?: string;
}

export const systemApi = {
  status: () => apiRequest<SystemStatus>('system.status'),
};

export const authApi = {
  me: () => apiRequest<{ user: AuthUser | null }>('auth.me').then(r => r.user),
  login: (username: string, password: string) =>
    apiRequest<{ user: AuthUser }>('auth.login', {
      method: 'POST',
      body: { username, password },
    }).then(r => r.user),
  logout: () => apiRequest<{ ok: true }>('auth.logout', { method: 'POST' }),
  changePassword: (new_password: string, current_password?: string) =>
    apiRequest<{ ok: true }>('auth.changePassword', {
      method: 'POST',
      body: { new_password, ...(current_password ? { current_password } : {}) },
    }),

  profile: (input: { name?: string; email?: string | null }) =>
    apiRequest<{ user: AuthUser }>('auth.profile', {
      method: 'PATCH',
      body: input,
    }).then(r => r.user),

  avatar: (formData: FormData) =>
    uploadRequest<{ user: AuthUser }>('api', 'auth.avatar', formData).then(r => r.user),

  removeAvatar: () =>
    apiRequest<{ user: AuthUser }>('auth.avatar', { method: 'DELETE' }).then(r => r.user),
};

export const pagesApi = {
  list: (params: { status?: PageStatus; page?: number; per_page?: number; tag?: string } = {}) =>
    apiRequest<PageListResult>('pages.list', {
      params: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.page ? { page: String(params.page) } : {}),
        ...(params.per_page ? { per_page: String(params.per_page) } : {}),
        ...(params.tag ? { tag: params.tag } : {}),
      },
    }),

  get: ({ id, slug }: { id?: number; slug?: string }) =>
    apiRequest<{ page: Page }>('pages.get', {
      params: {
        ...(id ? { id: String(id) } : {}),
        ...(slug ? { slug } : {}),
      },
    }).then(r => r.page),

  search: (q: string) => apiRequest<SearchResultSet>('pages.search', { params: { q } }),

  create: (input: PageInput) =>
    apiRequest<{ page: Page }>('pages.create', {
      method: 'POST',
      body: input,
    }).then(r => r.page),

  update: (input: Partial<PageInput> & { id: number }) =>
    apiRequest<{ page: Page }>('pages.update', {
      method: 'PATCH',
      body: input,
    }).then(r => r.page),

  remove: (id: number) =>
    apiRequest<{ ok: true }>('pages.delete', {
      method: 'DELETE',
      params: { id: String(id) },
    }),

  grants: (page_id: number) =>
    apiRequest<{ grants: Grant[] }>('pages.grants', {
      params: { page_id: String(page_id) },
    }).then(r => r.grants),

  grant: (page_id: number, username: string, permission: 'edit' | 'view' = 'edit', note?: string) =>
    apiRequest<{ ok: true }>('pages.grant', {
      method: 'POST',
      body: {
        page_id,
        username,
        permission,
        ...(note !== undefined ? { note } : {}),
      },
    }),

  revokeGrant: (page_id: number, username: string) =>
    apiRequest<{ ok: true }>('pages.revokeGrant', {
      method: 'POST',
      body: { page_id, username },
    }),
};

export interface UserInput {
  username: string;
  password: string;
  name: string;
  email?: string | null;
  role_ids?: number[];
}

export interface UserUpdateInput extends Partial<UserInput> {
  id: number;
  is_active?: boolean;
}

export const usersApi = {
  list: () => apiRequest<{ users: UserListItem[] }>('users.list').then(r => r.users),

  create: (input: UserInput) =>
    apiRequest<{ user: AuthUser }>('users.create', {
      method: 'POST',
      body: input,
    }).then(r => r.user),

  update: (input: UserUpdateInput) =>
    apiRequest<{ user: AuthUser }>('users.update', {
      method: 'PATCH',
      body: input,
    }).then(r => r.user),

  setRoles: (id: number, role_ids: number[]) =>
    apiRequest<{ user: AuthUser }>('users.setRoles', {
      method: 'POST',
      body: { id, role_ids },
    }).then(r => r.user),
};

export const rolesApi = {
  list: () => apiRequest<{ roles: RoleListItem[] }>('roles.list').then(r => r.roles),
};

export interface TagCount {
  name: string;
  count: number;
}

export const tagsApi = {
  list: () => apiRequest<{ tags: TagCount[] }>('tags.list').then(r => r.tags),
};

export type AssetKind = 'image' | 'video';

export interface Asset {
  id: number;
  name: string;
  mime: string;
  kind: AssetKind;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  md5: string | null;
  has_thumb: boolean;
  is_public: boolean;
  uploaded_by: number | null;
  uploaded_by_name: string;
  created_at: string;
  url: string;
  thumb_url: string;
}

export interface AssetListResult {
  items: Asset[];
  total: number;
  page: number;
  per_page: number;
}

export interface AssetCreateResult {
  asset: Asset;
  duplicate?: boolean;
}

export const assetsApi = {
  list: (params: { kind?: AssetKind; page?: number; per_page?: number; q?: string } = {}) =>
    apiRequest<AssetListResult>('assets.list', {
      params: {
        ...(params.kind ? { kind: params.kind } : {}),
        ...(params.page ? { page: String(params.page) } : {}),
        ...(params.per_page ? { per_page: String(params.per_page) } : {}),
        ...(params.q ? { q: params.q } : {}),
      },
    }),

  get: (id: number) =>
    apiRequest<{ asset: Asset }>('assets.get', {
      params: { id: String(id) },
    }).then(r => r.asset),

  create: (formData: FormData) =>
    uploadRequest<AssetCreateResult>('api', 'assets.create', formData),

  update: (id: number, input: { name?: string; is_public?: boolean }) =>
    apiRequest<{ asset: Asset }>('assets.update', {
      method: 'PATCH',
      body: { id, ...input },
    }).then(r => r.asset),

  remove: (id: number) =>
    apiRequest<{ ok: true }>('assets.delete', {
      method: 'DELETE',
      params: { id: String(id) },
    }),
};

export const migrationApi = {
  status: () => migrationRequest<MigrationStatus>('status'),
  run: () => migrationRequest<MigrationRunResult>('run', { method: 'POST' }),
};
