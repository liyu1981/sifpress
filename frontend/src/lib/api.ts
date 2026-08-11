export interface ApiHello {
  message: string
  time: string
  route: string
}

export interface ApiTime {
  unix: number
  iso: string
}

export interface Project {
  id: number
  name: string
}

export function apiUrl(
  action: string,
  params: Record<string, string> = {},
): string {
  const query = new URLSearchParams({ module: 'api', action, ...params })
  return `${window.location.pathname}?${query.toString()}`
}

async function api<T>(action: string): Promise<T> {
  const response = await fetch(apiUrl(action))

  if (!response.ok) {
    throw new Error(`API error ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function fetchHello(): Promise<ApiHello> {
  return api<ApiHello>('hello')
}

export function fetchTime(): Promise<ApiTime> {
  return api<ApiTime>('time')
}

export function fetchProjects(): Promise<Project[]> {
  return api<Project[]>('projects')
}

export async function createProject(name: string): Promise<Project> {
  const response = await fetch(apiUrl('projects'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

  if (!response.ok) {
    throw new Error(`API error ${response.status}`)
  }

  return response.json() as Promise<Project>
}
