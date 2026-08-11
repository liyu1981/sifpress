import { Link, useLocation } from '@tanstack/react-router'

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

export function NotFoundPage() {
  usePageTitle('Not found')

  const location = useLocation()

  return (
    <Card>
      <CardHeader>
        <Badge className="w-fit">404</Badge>
        <CardTitle className="text-3xl tracking-tight">Not found</CardTitle>
        <CardDescription>
          The route <strong>{location.href}</strong> does not exist.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild size="sm">
          <Link to="/">Back home</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
