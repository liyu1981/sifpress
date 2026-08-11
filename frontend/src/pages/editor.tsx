import { Link, useParams } from '@tanstack/react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { usePageTitle } from '@/hooks/use-page-title'
import { editorRoute } from '@/router'

export function EditorPage() {
  const { id } = useParams({ from: editorRoute.id })

  usePageTitle(`Editor ${id}`)

  return (
    <Card>
      <CardHeader>
        <Badge className="w-fit">Route → editor</Badge>
        <CardTitle className="text-3xl tracking-tight">Editor</CardTitle>
        <CardDescription>
          You are editing document <strong>{id}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild size="sm">
          <Link
            to="/editor/$id"
            params={{ id: String(Number(id) + 1) }}
          >
            Next doc
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
