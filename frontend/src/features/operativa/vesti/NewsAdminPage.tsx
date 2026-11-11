import { useState } from 'react';
import { Newspaper, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { isConflict } from '@/api/errors';
import { EmptyState } from '@/components/EmptyState';
import { NewsCard } from '@/components/NewsCard';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentStaff } from '@/auth/useStaffSession';
import { useDeleteNews, useLookupNames, useNews, useSetNewsPinned, useSettlementOptions } from '@/data/queries';
import type { NewsItem } from '@/domain/types';
import { canManageNews } from '@/lib/news';
import { NewsFormDialog } from './NewsFormDialog';

/**
 * Uređivanje vesti koje građani vide u `/gradjanin/vesti`. Izvor je isti, pa
 * dodavanje, izmena, kačenje i brisanje odmah menjaju građanski feed.
 *
 * Objavljivanje je administratorska radnja (`canManageNews`): vest ide svima i
 * ne može se povući iz poslatog SMS-a. Dispečer i vozač feed samo čitaju.
 */
export function NewsAdminPage() {
  const { data: staff } = useCurrentStaff();
  const { data: news, isPending } = useNews();
  // Naselja iz šifarnika backenda: objava nosi UUID, ne ID mock naselja.
  const settlementName = useLookupNames(useSettlementOptions().data);
  const pin = useSetNewsPinned();
  const remove = useDeleteNews();

  const [editing, setEditing] = useState<NewsItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<NewsItem | null>(null);

  const canManage = canManageNews(staff);

  const pinnedCount = news?.filter((n) => n.zakacena).length ?? 0;

  const openForm = (item: NewsItem | null) => {
    setEditing(item);
    setFormOpen(true);
  };

  const togglePin = (item: NewsItem) => {
    // Verzija ide uz kačenje kao uz svaku drugu izmenu: bez nje bi klik na
    // zastareloj listi vratio staru objavu na vrh.
    pin.mutate(
      { id: item.id, verzija: item.verzija, zakacena: !item.zakacena },
      {
        onSuccess: (updated) =>
          toast.success(updated.zakacena ? 'Objava je zakačena na vrh' : 'Objava je otkačena', {
            description: updated.naslov,
          }),
        onError: (error) =>
          toast.error(isConflict(error) ? 'Objava je u međuvremenu izmenjena' : 'Kačenje nije sačuvano', {
            description: isConflict(error) ? 'Lista je osvežena — pokušaj ponovo.' : error.message,
          }),
      },
    );
  };

  const doDelete = () => {
    if (!confirmDelete) return;
    const { id, naslov } = confirmDelete;
    remove.mutate(id, {
      onSuccess: () => {
        toast.success('Objava je obrisana', { description: naslov });
        setConfirmDelete(null);
      },
      onError: (error) => toast.error('Brisanje nije uspelo', { description: error.message }),
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Vesti"
        description="Objave koje građani vide u aplikaciji, a bez pametnog telefona SMS-om ili preko predsednika MZ."
        actions={
          canManage ? (
            <Button onClick={() => openForm(null)}>
              <Plus /> Nova objava
            </Button>
          ) : null
        }
      />

      {canManage ? null : (
        <Card className="gap-1 p-4">
          <p className="font-medium">Objave uređuje administrator</p>
          <p className="text-sm text-muted-foreground text-pretty">
            Vest stiže svim građanima i ne može se povući iz poslatog SMS-a, pa je objavljivanje vezano za
            administratorski nalog. Ovde vidiš isti feed koji vide građani.
          </p>
        </Card>
      )}

      {isPending ? (
        <div className="max-w-2xl space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : (news?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="Nema objava"
          description="Prva objava je obično izmena rasporeda odvoza ili najava akcije čišćenja."
          action={canManage ? <Button onClick={() => openForm(null)}>Nova objava</Button> : undefined}
        />
      ) : (
        <div className="max-w-2xl space-y-3">
          <p className="text-xs text-muted-foreground">
            {news?.length} objava · {pinnedCount} zakačeno · redosled je isti kao u feedu građana
          </p>
          {news?.map((item) => (
            <NewsCard
              key={item.id}
              item={item}
              settlementName={settlementName(item.naselje_id) || undefined}
              actions={
                canManage ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => togglePin(item)}
                      disabled={pin.isPending}
                      title={item.zakacena ? 'Otkači sa vrha' : 'Zakači na vrh'}
                    >
                      {item.zakacena ? <PinOff /> : <Pin />}
                      {item.zakacena ? 'Otkači' : 'Zakači'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openForm(item)}>
                      <Pencil /> Izmeni
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(item)}
                    >
                      <Trash2 /> Obriši
                    </Button>
                  </>
                ) : null
              }
            />
          ))}
        </div>
      )}

      <NewsFormDialog open={formOpen} item={editing} onClose={() => setFormOpen(false)} />

      <Dialog open={confirmDelete !== null} onOpenChange={(o) => (o ? null : setConfirmDelete(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Obriši objavu</DialogTitle>
            <DialogDescription>
              „{confirmDelete?.naslov}“ nestaje iz feeda građana. Već poslate SMS poruke se ne povlače — ako je vest
              pogrešna, bolje je izmeniti je nego obrisati.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={remove.isPending}>
              Otkaži
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={remove.isPending}>
              {remove.isPending ? 'Brišem…' : 'Obriši'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
