import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { ClassificationController } from './classification.controller';
import { ClassificationDrainInterceptor } from './classification.drain';
import { ClassificationRepository } from './classification.repository';
import { ClassificationRunner } from './classification.runner';
import { ClassificationService } from './classification.service';
import { KLASIFIKATOR, type ClassifierPort } from './classifier.port';
import { OpenAiClassifier } from './openai.classifier';
import { RuleClassifier } from './rule.classifier';

/**
 * Automatic report triage.
 *
 * A leaf in the module map: it reads `app.prijava` through its own repository
 * and is imported by nothing. `reports` queues work by inserting a row in the
 * report's own transaction, which is an outbox and not a call, so the two
 * modules never have to know about each other.
 *
 * That is also why the post-submission drain is a globally registered
 * interceptor rather than a decorator on the reports controller: the trigger
 * belongs to this side of the outbox, and registering it here keeps the arrow
 * pointing in one direction.
 */
@Module({
  imports: [AuthModule],
  controllers: [ClassificationController],
  providers: [
    ClassificationRepository,
    ClassificationService,
    ClassificationRunner,
    RuleClassifier,
    // Global, but it only acts on the two routes that fill the queue.
    { provide: APP_INTERCEPTOR, useClass: ClassificationDrainInterceptor },
    {
      provide: KLASIFIKATOR,
      inject: [ConfigService, RuleClassifier],
      // No key, no model: the feature degrades to keyword matching instead of
      // refusing to boot. That is what keeps CI, contract generation and an
      // offline demo working, and it is why every caller goes through the port.
      useFactory: (config: ConfigService, pravila: RuleClassifier): ClassifierPort => {
        const kljuc = config.get<string>('OPENAI_API_KEY');
        if (!kljuc) {
          new Logger('Classification').warn('OPENAI_API_KEY nije postavljen - klasifikacija radi samo po kljucnim recima');
          return pravila;
        }
        return new OpenAiClassifier(config);
      },
    },
  ],
  exports: [ClassificationService],
})
export class ClassificationModule {}
