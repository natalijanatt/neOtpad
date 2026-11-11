import { Hammer } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';

interface ComingSoonProps {
  title: string;
  description?: string;
  /** Faza iz UI-PLAN.md u kojoj se ekran gradi. */
  phase: number;
}

/** Ljuštura ekrana dok se ne stigne do njegove faze. Briše se kad ekran dobije sadržaj. */
export function ComingSoon({ title, description, phase }: ComingSoonProps) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} {...(description ? { description } : {})} />
      <EmptyState
        icon={Hammer}
        title={`U izradi — Faza ${phase}`}
        description="Ovaj ekran dobija sadržaj u narednoj fazi plana. Navigacija i podaci su već spremni."
      />
    </div>
  );
}
