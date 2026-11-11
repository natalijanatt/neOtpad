import { OpenAiWasteClassifier } from './openai-classifier';
import type { WasteClassifier } from './waste-classifier.port';

/** The model's reply as the Chat Completions API wraps it. */
const reply = (content: string) => ({ ok: true, status: 200, json: () => Promise.resolve({ choices: [{ message: { content } }] }) });

describe('OpenAiWasteClassifier', () => {
  const fallback: WasteClassifier = { classify: jest.fn().mockResolvedValue({ materijal: 'metal', izvor: 'kljucne_reci' }) };
  const make = () => new OpenAiWasteClassifier({ apiKey: 'sk-test', model: 'gpt-5.6-luna', timeoutMs: 1000 }, fallback);
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    (fallback.classify as jest.Mock).mockClear();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('returns the model answer and says it came from the model', async () => {
    fetchMock.mockResolvedValue(reply('{"materijal":"iverica"}'));
    await expect(make().classify('ormar od iverice')).resolves.toEqual({ materijal: 'iverica', izvor: 'openai' });
    expect(fallback.classify).not.toHaveBeenCalled();
  });

  it('maps "nepoznato" to null instead of forcing a category', async () => {
    fetchMock.mockResolvedValue(reply('{"materijal":"nepoznato"}'));
    await expect(make().classify('kako je vreme')).resolves.toEqual({ materijal: null, izvor: 'openai' });
  });

  // The citizen still gets an answer when the model does not deliver one.
  it.each([
    ['an HTTP error', () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })],
    ['a network failure or timeout', () => Promise.reject(new Error('aborted'))],
    ['a category outside the enum', () => Promise.resolve(reply('{"materijal":"uranijum"}'))],
    ['broken JSON', () => Promise.resolve(reply('{"materijal":'))],
  ])('falls back to keywords on %s', async (_case, response) => {
    fetchMock.mockImplementation(response);
    await expect(make().classify('staro gvozdje')).resolves.toEqual({ materijal: 'metal', izvor: 'kljucne_reci' });
    expect(fallback.classify).toHaveBeenCalledWith('staro gvozdje');
  });

  it('pays once for the same question, however it is spelled', async () => {
    fetchMock.mockResolvedValue(reply('{"materijal":"elektronski"}'));
    const classifier = make();
    await classifier.classify('Frižider');
    await expect(classifier.classify('  frizider ')).resolves.toEqual({ materijal: 'elektronski', izvor: 'openai' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not remember a fallback answer, so the next ask reaches the model again', async () => {
    fetchMock.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(reply('{"materijal":"metal"}'));
    const classifier = make();
    await classifier.classify('lim');
    await expect(classifier.classify('lim')).resolves.toEqual({ materijal: 'metal', izvor: 'openai' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
