import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';

export function ErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-6xl font-semibold text-muted-foreground/40">{notFound ? '404' : '!'}</p>
      <h1 className="text-xl font-semibold">{notFound ? 'Stranica ne postoji' : 'Nešto je pošlo naopako'}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {notFound
          ? 'Proveri adresu ili se vrati na početnu.'
          : error instanceof Error
            ? error.message
            : 'Pokušaj ponovo ili se vrati na početnu.'}
      </p>
      <Button asChild>
        <Link to="/">Na početnu</Link>
      </Button>
    </div>
  );
}
