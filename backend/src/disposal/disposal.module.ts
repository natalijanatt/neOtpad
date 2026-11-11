import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { KeywordWasteClassifier } from './classifier/keyword-classifier';
import { OpenAiWasteClassifier } from './classifier/openai-classifier';
import { WASTE_CLASSIFIER, type WasteClassifier } from './classifier/waste-classifier.port';
import { CollectorsController } from './collectors.controller';
import { CollectorsRepository } from './collectors.repository';
import { DisposalController } from './disposal.controller';
import { DisposalService } from './disposal.service';
import { SitesRepository } from './sites.repository';

/**
 * Median answer from the configured model was ~0.9 s when it was chosen;
 * past 8 s the keyword answer beats a spinner on a village connection.
 */
const MODEL_TIMEOUT_MS = 8_000;

@Module({
  imports: [AuthModule],
  controllers: [DisposalController, CollectorsController],
  providers: [
    CollectorsRepository,
    SitesRepository,
    DisposalService,
    KeywordWasteClassifier,
    {
      // The model when there is a key, the keyword table when there is not —
      // decided once at boot. The keyword classifier is also the model's
      // fallback, so the endpoint answers either way.
      provide: WASTE_CLASSIFIER,
      inject: [ConfigService, KeywordWasteClassifier],
      useFactory: (config: ConfigService, keywords: KeywordWasteClassifier): WasteClassifier => {
        const apiKey = config.get<string>('OPENAI_API_KEY');
        if (!apiKey) return keywords;
        return new OpenAiWasteClassifier({ apiKey, model: config.getOrThrow<string>('OPENAI_MODEL'), timeoutMs: MODEL_TIMEOUT_MS }, keywords);
      },
    },
  ],
})
export class DisposalModule {}
