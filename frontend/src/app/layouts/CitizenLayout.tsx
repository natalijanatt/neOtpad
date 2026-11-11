import { CalendarDays, Home, MapPin, Plus, User } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/gradjanin', label: 'Početna', icon: Home, end: true },
  { to: '/gradjanin/raspored', label: 'Raspored', icon: CalendarDays },
  { to: '/gradjanin/prijava', label: 'Prijavi', icon: Plus, primary: true },
  { to: '/gradjanin/mapa', label: 'Mapa', icon: MapPin },
  { to: '/gradjanin/profil', label: 'Profil', icon: User },
];

/**
 * Građanska zona: mobilni ekran. Na desktopu se prikazuje kao "telefon" u
 * sredini, da demo na projektoru izgleda kao aplikacija.
 *
 * Donja navigacija je plutajuća pilula, ne traka uz ivicu; `--citizen-nav-h`
 * je njena ukupna visina (pilula + razmak do ivice) i jedino mesto koje
 * ekrani sa sopstvenom fiksnom trakom (čarobnjak prijave) treba da čitaju.
 */
export function CitizenLayout() {
  return (
    <div className="min-h-dvh bg-muted/60 [--citizen-nav-h:5.5rem]">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background shadow-xl">
        <main className="flex-1 px-4 pt-5 pb-[calc(var(--citizen-nav-h)+1rem)]">
          <Outlet />
        </main>

        <nav
          aria-label="Glavna navigacija"
          className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md px-4 pb-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <ul className="grid h-16 grid-cols-5 items-center rounded-full bg-card/95 shadow-lg ring-1 ring-foreground/5 backdrop-blur supports-[backdrop-filter]:bg-card/85">
            {NAV.map(({ to, label, icon: Icon, end, primary }) => (
              <li key={to} className="flex justify-center">
                <NavLink
                  to={to}
                  end={end ?? false}
                  aria-label={primary ? label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors',
                      isActive && !primary && 'text-forest',
                    )
                  }
                >
                  {({ isActive }) =>
                    primary ? (
                      // Koralno „+“ viri iznad pilule: jedina radnja koju
                      // aplikacija stvarno traži od građanina, pa je i najuočljivija.
                      <span
                        className={cn(
                          '-mt-9 flex size-14 items-center justify-center rounded-full bg-rose text-white shadow-lg shadow-rose/40 ring-4 ring-background transition-transform',
                          isActive ? 'scale-105 rotate-45' : 'active:scale-95',
                        )}
                      >
                        <Icon className="size-7" strokeWidth={2.5} />
                      </span>
                    ) : (
                      <>
                        <span
                          className={cn(
                            'flex h-7 w-11 items-center justify-center rounded-full transition-colors',
                            isActive && 'bg-sour-apple',
                          )}
                        >
                          <Icon className={cn('size-5', isActive && 'stroke-[2.5]')} />
                        </span>
                        <span>{label}</span>
                      </>
                    )
                  }
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
