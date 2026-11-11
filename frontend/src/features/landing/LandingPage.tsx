import { ArrowRight, Smartphone, Truck } from 'lucide-react';
import { Link } from 'react-router';
import { Logo } from '@/components/Logo';
import { Card } from '@/components/ui/card';

const ZONES = [
  {
    to: '/gradjanin',
    icon: Smartphone,
    title: 'Građanin',
    description: 'Prijavi prepunjen kontejner ili divlju deponiju, vidi kada dolazi kamion, sakupljaj bodove.',
    hint: 'Mobilni prikaz',
  },
  {
    to: '/operativa',
    icon: Truck,
    title: 'Operativa',
    description: 'Mapa kontejnera i žarišta, prijave po prioritetu, dnevni plan ruta za osam kamiona, analitika.',
    hint: 'JKP · Odeljenje za životnu sredinu',
  },
];

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-green-tea to-background px-4 py-12">
      <div className="mb-10 flex flex-col items-center text-center">
        <h1>
          <Logo size="lg" />
          <span className="sr-only">(n)eOtpad</span>
        </h1>
        <p className="mt-2 max-w-md text-muted-foreground text-pretty">
          Pametno upravljanje otpadom: senzori na kontejnerima, predviđanje, optimalne rute i prijave građana — na
          jednom mestu.
        </p>
      </div>

      <div className="grid w-full max-w-3xl gap-4 md:grid-cols-2">
        {ZONES.map(({ to, icon: Icon, title, description, hint }) => (
          <Card key={to} className="group relative p-0 transition-shadow hover:shadow-lg">
            <Link to={to} className="flex h-full flex-col gap-4 p-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl">
              <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <Icon className="size-5" />
              </span>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">{title}</h2>
                <p className="mt-1 text-sm text-muted-foreground text-pretty">{description}</p>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{hint}</span>
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          </Card>
        ))}
      </div>

      <p className="mt-10 text-xs text-muted-foreground">Hakaton AI4Society · Izazov C · Tim Octocode</p>
    </div>
  );
}
