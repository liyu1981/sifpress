import { apiRequest, migrationRequest } from '@/lib/api'

export type PageStatus = 'draft' | 'published'

export interface AuthUser {
  id: number
  username: string
  email: string | null
  name: string
  must_change_password: boolean
  created_at: string
  updated_at: string
  roles: string[]
  permissions: string[]
}

export interface Page {
  id: number
  slug: string
  title: string
  content_md: string
  tags: string[]
  status: PageStatus
  created_by: number | null
  created_by_name: string
  updated_by: number | null
  updated_by_name: string
  created_at: string
  updated_at: string
  can_edit: boolean
}

export interface PageListItem {
  id: number
  slug: string
  title: string
  content_md: string
  tags: string[]
  status: PageStatus
  created_by_name: string
  updated_at: string
  can_edit: boolean
}

export interface SearchResult {
  id: number
  slug: string
  title: string
  excerpt: string
  status: PageStatus
  created_by_name: string
  updated_at: string
  can_edit: boolean
}

export interface UserListItem {
  id: number
  username: string
  email: string | null
  name: string
  is_active: boolean
  must_change_password: boolean
  created_at: string
  updated_at: string
  roles: string[]
}

export interface RoleListItem {
  id: number
  code: string
  name: string
  description: string
  permissions: string[]
}

export interface Grant {
  username: string
  name: string
  granted_by_name: string
  created_at: string
}

export interface SystemStatus {
  name: string
  api: boolean
  migrate_required: boolean
  version: string[]
  latest: string[]
}

export interface MigrationStatus {
  migrate_required: boolean
  version: string[]
  latest: string[]
  migrations: { version: string; applied: boolean }[]
}

export interface MigrationRunResult {
  applied: string[]
  latest: string[]
  migrate_required: false
}

export interface PageListResult {
  items: PageListItem[]
  total: number
  page: number
  per_page: number
}

export interface SearchResultSet {
  items: SearchResult[]
  total: number
}

export interface PageInput {
  slug: string
  title: string
  content_md: string
  status: PageStatus
}

export const systemApi = {
  status: () => apiRequest<SystemStatus>('system.status'),
}

export const authApi = {
  me: () =>
    apiRequest<{ user: AuthUser | null }>('auth.me').then((r) => r.user),
  login: (username: string, password: string) =>
    apiRequest<{ user: AuthUser }>('auth.login', {
      method: 'POST',
      body: { username, password },
    }).then((r) => r.user),
  logout: () =>
    apiRequest<{ ok: true }>('auth.logout', { method: 'POST' }),
  changePassword: (new_password: string, current_password?: string) =>
    apiRequest<{ ok: true }>('auth.changePassword', {
      method: 'POST',
      body: { new_password, ...(current_password ? { current_password } : {}) },
    }),
}

export const pagesApi = {
  list: (
    params: { status?: PageStatus; page?: number; per_page?: number; tag?: string } = {},
  ) =>
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
    }).then((r) => r.page),

  search: (q: string) =>
    apiRequest<SearchResultSet>('pages.search', { params: { q } }),

  create: (input: PageInput) =>
    apiRequest<{ page: Page }>('pages.create', {
      method: 'POST',
      body: input,
    }).then((r) => r.page),

  update: (input: Partial<PageInput> & { id: number }) =>
    apiRequest<{ page: Page }>('pages.update', {
      method: 'PATCH',
      body: input,
    }).then((r) => r.page),

  remove: (id: number) =>
    apiRequest<{ ok: true }>('pages.delete', {
      method: 'DELETE',
      params: { id: String(id) },
    }),

  grants: (page_id: number) =>
    apiRequest<{ grants: Grant[] }>('pages.grants', {
      params: { page_id: String(page_id) },
    }).then((r) => r.grants),

  grant: (page_id: number, username: string) =>
    apiRequest<{ ok: true }>('pages.grant', {
      method: 'POST',
      body: { page_id, username },
    }),

  revokeGrant: (page_id: number, username: string) =>
    apiRequest<{ ok: true }>('pages.revokeGrant', {
      method: 'POST',
      body: { page_id, username },
    }),
}

export interface UserInput {
  username: string
  password: string
  name: string
  email?: string | null
  role_ids?: number[]
}

export interface UserUpdateInput extends Partial<UserInput> {
  id: number
  is_active?: boolean
}

export const usersApi = {
  list: () =>
    apiRequest<{ users: UserListItem[] }>('users.list').then((r) => r.users),

  create: (input: UserInput) =>
    apiRequest<{ user: AuthUser }>('users.create', {
      method: 'POST',
      body: input,
    }).then((r) => r.user),

  update: (input: UserUpdateInput) =>
    apiRequest<{ user: AuthUser }>('users.update', {
      method: 'PATCH',
      body: input,
    }).then((r) => r.user),

  setRoles: (id: number, role_ids: number[]) =>
    apiRequest<{ user: AuthUser }>('users.setRoles', {
      method: 'POST',
      body: { id, role_ids },
    }).then((r) => r.user),
}

export const rolesApi = {
  list: () =>
    apiRequest<{ roles: RoleListItem[] }>('roles.list').then((r) => r.roles),
}

export interface TagCount {
  name: string
  count: number
}

export const tagsApi = {
  list: () =>
    apiRequest<{ tags: TagCount[] }>('tags.list').then((r) => r.tags),
}

export const migrationApi = {
  status: () => migrationRequest<MigrationStatus>('status'),
  run: () => migrationRequest<MigrationRunResult>('run', { method: 'POST' }),
}
