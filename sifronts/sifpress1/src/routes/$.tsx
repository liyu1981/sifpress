import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/$')({
  component: NotFoundPage,
});

function NotFoundPage() {
  return (
    <div className="text-center py-24">
      <h1 className="text-4xl font-bold text-foreground mb-4">404</h1>
      <p className="text-muted-foreground mb-6">Page not found</p>
      <Link
        to="/"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
      >
        Go home
      </Link>
    </div>
  );
}
