import { MATERIJAL_OPIS, MATERIJALI } from '../materijal';

/** What the model returns when the text is not about disposal, or too unclear. */
export const UNKNOWN = 'nepoznato';

/**
 * The instruction. English, because the rules have to be exact; the category
 * examples stay Serbian, because they are the words the model must recognise.
 *
 * The user's text is never pasted in here — it goes in its own message, and the
 * output is an enum checked again on our side, so the worst a hostile input can
 * do is get itself filed under the wrong category.
 */
export function systemPrompt(): string {
  const categories = MATERIJALI.map((m) => `- ${m}: ${MATERIJAL_OPIS[m]}`).join('\n');
  return `You sort what a resident of Pirot, Serbia wants to throw away into exactly one category.

The text is Serbian as people really type it: Latin or Cyrillic script, with or without diacritics (c for č/ć, s for š, z for ž, dj for đ), ekavian or ijekavian (železo / željezo), the Torlakian speech of the Pirot region, colloquial words, typos, and whole sentences ("gde da bacim stari šporet?").

Categories:
${categories}
- ${UNKNOWN}: the text is not about getting rid of an item, names nothing recognisable, or fits none of the above.

Rules:
- Electrical appliances are "elektronski" even though they contain metal.
- Furniture made of particle board is "iverica", not "kabasti".
- Choose by what the item is mostly made of when it is not an appliance.
- If several items are named, choose the first one.
- Answer only with the JSON object required by the schema.`;
}

/**
 * Strict structured output: the model can only answer with one of these
 * strings. "nepoznato" instead of null keeps the schema valid on every model
 * that supports structured outputs.
 */
export const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'klasifikacija_otpada',
    strict: true,
    schema: {
      type: 'object',
      properties: { materijal: { type: 'string', enum: [...MATERIJALI, UNKNOWN] } },
      required: ['materijal'],
      additionalProperties: false,
    },
  },
} as const;
