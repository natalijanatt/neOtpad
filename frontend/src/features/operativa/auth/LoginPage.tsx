import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ArrowLeft, Leaf, Loader2, LogIn, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RequireGuest } from '@/auth/RequireGuest';
import { useLogin } from '@/auth/useStaffSession';

/** Demo nalog iz `.env.local`; bez njega forma je prazna, a brza prijava skrivena. */
const DEMO_EMAIL = import.meta.env.VITE_STAFF_EMAIL ?? '';
const DEMO_PASSWORD = import.meta.env.VITE_STAFF_PASSWORD ?? '';

/**
 * Prijava radnika JKP-a. Sve rute reda prijava traže Bearer token
 * (docs/reports-mvp.md), pa operativna zona bez ovog ekrana ne radi ni jedan
 * poziv. Nema registracije — naloge pravi backend komandom `provision:staff`.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();

  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);

  // Kuda se vraćamo posle prijave: na stranicu sa koje je čuvar preusmerio.
  const from = (location.state as { from?: string } | null)?.from ?? '/operativa';

  const submit = (credentials: { email: string; password: string }) => {
    if (!credentials.email || !credentials.password) return;
    login.mutate(credentials, { onSuccess: () => navigate(from, { replace: true }) });
  };

  return (
    <RequireGuest>
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/">
            <ArrowLeft /> Nazad na izbor zone
          </Link>
        </Button>

        <Card className="gap-5 p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Leaf className="size-5" />
            </span>
            <div>
              <h1 className="font-semibold">Operativa · (n)eOtpad</h1>
              <p className="text-xs text-muted-foreground">Prijava za JKP i dispečere</p>
            </div>
          </div>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit({ email: email.trim(), password });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ime@primer.rs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Lozinka</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {login.isError ? (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive text-pretty">{login.error.message}</p>
            ) : null}

            <Button type="submit" className="w-full" disabled={login.isPending || !email.trim() || !password}>
              {login.isPending ? <Loader2 className="animate-spin" /> : <LogIn />}
              {login.isPending ? 'Prijavljujem…' : 'Prijavi se'}
            </Button>
          </form>

          {DEMO_EMAIL && DEMO_PASSWORD ? (
            <div className="space-y-2 border-t pt-4">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={login.isPending}
                onClick={() => {
                  setEmail(DEMO_EMAIL);
                  setPassword(DEMO_PASSWORD);
                  submit({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
                }}
              >
                <Zap /> Brza prijava (demo nalog)
              </Button>
              <p className="text-xs text-muted-foreground">Nalog iz `.env.local` — za demonstraciju, ne za pravi rad.</p>
            </div>
          ) : (
            <p className="border-t pt-4 text-xs text-muted-foreground text-pretty">
              Za brzu prijavu jednim klikom upiši demo nalog u `frontend/.env.local` (`VITE_STAFF_EMAIL`,
              `VITE_STAFF_PASSWORD`) — vidi `.env.example`.
            </p>
          )}
        </Card>

        <p className="px-2 text-xs text-muted-foreground text-pretty">
          Naloge pravi backend (`npm run provision:staff`); javne registracije nema. Token važi 30 minuta, posle toga je
          potrebna nova prijava.
        </p>
      </div>
    </div>
    </RequireGuest>
  );
}
