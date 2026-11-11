import {
  BarChart3,
  Container,
  LayoutDashboard,
  Leaf,
  LogOut,
  Map,
  MapPinned,
  MessageSquareWarning,
  Newspaper,
  Route,
  Users,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { ApiStatus } from '@/components/ApiStatus';
import { RequireStaff } from '@/auth/RequireStaff';
import { useCurrentStaff, useLogout } from '@/auth/useStaffSession';
import { STAFF_ROLE_LABEL } from '@/lib/labels';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';

const NAV_GROUPS = [
  {
    label: 'Pregled',
    items: [
      { to: '/operativa', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/operativa/mapa', label: 'Mapa', icon: Map },
      { to: '/operativa/pokrivenost', label: 'Pokrivenost', icon: MapPinned },
    ],
  },
  {
    label: 'Operativa',
    items: [
      { to: '/operativa/kontejneri', label: 'Kontejneri', icon: Container },
      { to: '/operativa/prijave', label: 'Prijave', icon: MessageSquareWarning },
      { to: '/operativa/rute', label: 'Rute', icon: Route },
    ],
  },
  {
    label: 'Planiranje',
    items: [
      { to: '/operativa/analitika', label: 'Analitika', icon: BarChart3 },
      { to: '/operativa/zajednica', label: 'Zajednica', icon: Users },
      { to: '/operativa/vesti', label: 'Vesti', icon: Newspaper },
    ],
  },
];

function currentTitle(pathname: string): string {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.end ? pathname === item.to : pathname.startsWith(item.to)) return item.label;
    }
  }
  return 'Operativa';
}

/** Zona za JKP i odeljenje za životnu sredinu: desktop, sidebar. */
export function OpsLayout() {
  const { pathname } = useLocation();
  const { data: staff } = useCurrentStaff();
  const logout = useLogout();

  return (
    <RequireStaff>
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Leaf className="size-4" />
                  </span>
                  <span className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">(n)eOtpad</span>
                    <span className="truncate text-xs text-muted-foreground">Operativa · JKP</span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map(({ to, label, icon: Icon, end }) => (
                    <SidebarMenuItem key={to}>
                      <NavLink to={to} end={end ?? false}>
                        {({ isActive }) => (
                          <SidebarMenuButton isActive={isActive} tooltip={label}>
                            <Icon />
                            <span>{label}</span>
                          </SidebarMenuButton>
                        )}
                      </NavLink>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter>
          {/* Ko je ulogovan određuje šta backend dozvoljava: vozač ne vidi red
              prijava, pa uloga stoji uz ime, ne samo ime. */}
          {staff ? (
            <div className="flex items-center gap-2 px-2 group-data-[collapsible=icon]:hidden">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{staff.ime}</p>
                <p className="truncate text-xs text-muted-foreground">{STAFF_ROLE_LABEL[staff.uloga]}</p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={logout} title="Odjava" aria-label="Odjava">
                <LogOut />
              </Button>
            </div>
          ) : null}
          <ApiStatus className="px-2 py-1 group-data-[collapsible=icon]:hidden" />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm font-medium">{currentTitle(pathname)}</span>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
    </RequireStaff>
  );
}
