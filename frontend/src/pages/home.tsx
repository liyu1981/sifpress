import { useQuery } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { fetchHello, fetchTime } from '@/lib/api'

import { usePageTitle } from '@/hooks/use-page-title'

export function HomePage() {
  usePageTitle('Single PHP React SPA')

  const hello = useQuery({
    queryKey: ['api', 'hello'],
    queryFn: fetchHello,
  })

  const time = useQuery({
    queryKey: ['api', 'time'],
    queryFn: fetchTime,
  })

  return (
    <Card>
      <CardHeader>
        <Badge className="w-fit">PHP + React</Badge>
        <CardTitle className="text-3xl tracking-tight">
          Single-file SPA
        </CardTitle>
        <CardDescription>
          One <code>index.php</code> that works at the domain root or any
          subdirectory — no rewrite rules required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 rounded-lg bg-muted/50 p-4">
          <p className="text-sm font-medium">Current URL</p>
          <p className="text-sm text-muted-foreground">
            {window.location.pathname}
          </p>
        </div>

        <div className="space-y-1 rounded-lg bg-muted/50 p-4">
          <p className="text-sm font-medium">API response (hello)</p>
          <p className="text-sm text-muted-foreground">
            {hello.isLoading ? 'Loading…' : hello.data?.message}
          </p>
        </div>

        <div className="space-y-1 rounded-lg bg-muted/50 p-4">
          <p className="text-sm font-medium">Server time</p>
          <p className="text-sm text-muted-foreground">
            {time.isLoading ? 'Loading…' : time.data?.iso ?? '—'}
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          Routes are pure query parameters (<code>u=...</code>). Try the links
          below.
        </p>
      </CardContent>
    </Card>
  )
}
