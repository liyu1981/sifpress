import { Link, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/$')({
  component: NotFoundPage,
});

function NotFoundPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-24 text-center sm:px-6">
      <p className="kicker">404</p>
      <h1 className="headline mt-4 text-5xl sm:text-6xl">Page not found</h1>
      <p className="dek mt-4">The page you’re after has moved, or never made it to press.</p>
      <Link
        to="/"
        className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-brand transition-colors hover:text-brand-ink"
      >
        ← Back to the front page
      </Link>
    </div>
  );
}
