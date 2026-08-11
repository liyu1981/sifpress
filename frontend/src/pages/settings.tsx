import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FormEvent } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createProject } from '@/lib/api'
import { usePageTitle } from '@/hooks/use-page-title'

export function SettingsPage() {
  usePageTitle('Settings')

  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [created, setCreated] = useState<{ id: number; name: string } | null>(
    null,
  )

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: (data) => {
      setCreated(data)
      setName('')
      queryClient.invalidateQueries({ queryKey: ['api', 'projects'] })
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (name.trim() !== '') {
      mutation.mutate(name.trim())
    }
  }

  return (
    <Card>
      <CardHeader>
        <Badge className="w-fit">Route → settings / POST API</Badge>
        <CardTitle className="text-3xl tracking-tight">Settings</CardTitle>
        <CardDescription>
          Create a project via <code>?module=api&amp;action=projects</code>{' '}
          (POST).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="flex items-end gap-3" onSubmit={handleSubmit}>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              value={name}
              placeholder="My project"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create'}
          </Button>
        </form>

        <div className="space-y-1 rounded-lg bg-muted/50 p-4">
          <p className="text-sm font-medium">Last created</p>
          <p className="text-sm text-muted-foreground">
            {created ? `#${created.id} — ${created.name}` : '—'}
          </p>
          {mutation.isError && (
            <p className="text-sm text-destructive">
              Could not create project.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
