import { ConfigService } from '@nestjs/config';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { ClassificationDrainInterceptor } from './classification.drain';
import type { ClassificationService, ObradaRezultat } from './classification.service';

const prazno: ObradaRezultat = { obradjeno: 0, uspesno: 0, odlozeno: 0, zastarelo: 0, neuspesno: 0 };

const kontekst = (method: string, path: string): ExecutionContext => ({
  switchToHttp: () => ({ getRequest: () => ({ method, path }) }),
} as unknown as ExecutionContext);

const handler = (odgovor = of({ kratki_kod: 'PR-TEST' })): CallHandler => ({ handle: () => odgovor });

function postavi(env: Record<string, unknown> = {}) {
  const obradiRed = jest.fn<Promise<ObradaRezultat>, [number]>().mockResolvedValue(prazno);
  const interceptor = new ClassificationDrainInterceptor(
    { obradiRed } as unknown as ClassificationService,
    new ConfigService(env),
  );
  return { interceptor, obradiRed };
}

describe('praznjenje reda posle slanja prijave', () => {
  it('prazni red kada je prijava primljena', () => {
    const { interceptor, obradiRed } = postavi();
    interceptor.intercept(kontekst('POST', '/reports'), handler()).subscribe();
    expect(obradiRed).toHaveBeenCalledWith(1);
  });

  it('prazni red i za prijavu primljenu telefonom', () => {
    const { interceptor, obradiRed } = postavi();
    interceptor.intercept(kontekst('POST', '/reports/assisted'), handler()).subscribe();
    expect(obradiRed).toHaveBeenCalledTimes(1);
  });

  // The two routes above are the only ones that write a queue row. Everything
  // else under /reports would pay for a query that can only come back empty.
  it.each([
    ['GET', '/reports'],
    ['POST', '/reports/photos'],
    ['POST', '/reports/id/triage'],
    ['GET', '/health'],
  ])('ne dira red na %s %s', (method, path) => {
    const { interceptor, obradiRed } = postavi();
    interceptor.intercept(kontekst(method, path), handler()).subscribe();
    expect(obradiRed).not.toHaveBeenCalled();
  });

  it('ne prazni red kada je slanje prijave odbijeno', () => {
    const { interceptor, obradiRed } = postavi();
    interceptor.intercept(kontekst('POST', '/reports'), handler(throwError(() => new Error('odbijeno'))))
      .subscribe({ error: () => undefined });
    expect(obradiRed).not.toHaveBeenCalled();
  });

  it('postuje iskljucen worker', () => {
    const { interceptor, obradiRed } = postavi({ CLASSIFY_WORKER_ENABLED: false });
    interceptor.intercept(kontekst('POST', '/reports'), handler()).subscribe();
    expect(obradiRed).not.toHaveBeenCalled();
  });

  it('uzima onoliko prijava koliko traži CLASSIFY_DRAIN_BATCH', () => {
    const { interceptor, obradiRed } = postavi({ CLASSIFY_DRAIN_BATCH: 3 });
    interceptor.intercept(kontekst('POST', '/reports'), handler()).subscribe();
    expect(obradiRed).toHaveBeenCalledWith(3);
  });

  // Background work runs after the response, where a throw has nobody to reach.
  // An unhandled rejection would take the process down with it.
  it('proguta gresku u pozadinskom poslu', async () => {
    const { interceptor, obradiRed } = postavi();
    obradiRed.mockRejectedValue(new Error('model nedostupan'));
    const neuhvacene = jest.fn();
    process.once('unhandledRejection', neuhvacene);

    interceptor.intercept(kontekst('POST', '/reports'), handler()).subscribe();
    await new Promise((resolve) => setImmediate(resolve));

    process.off('unhandledRejection', neuhvacene);
    expect(neuhvacene).not.toHaveBeenCalled();
  });
});
