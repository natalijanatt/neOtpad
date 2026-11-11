import type { AppMaterijalOtpada } from '../../database/generated/schema';

/**
 * Free text → material. Behind a token (`di-use-interfaces-tokens`) because the
 * answer can come from a model or from the keyword table, and the service must
 * not care which: the model is an improvement, never a dependency.
 */
export const WASTE_CLASSIFIER = Symbol('WASTE_CLASSIFIER');

/** Which classifier answered. Returned by the API so validation can see it. */
export type ClassifierSource = 'openai' | 'kljucne_reci';

export interface Classification {
  /** Null when the text is not about getting rid of something, or too unclear. */
  materijal: AppMaterijalOtpada | null;
  izvor: ClassifierSource;
}

export interface WasteClassifier {
  classify(text: string): Promise<Classification>;
}
