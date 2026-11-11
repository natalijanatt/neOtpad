import { Controller, Header, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { DispatcherOnly, StaffGuard } from '../auth/auth.guard';
import { ClassificationService } from './classification.service';
import { classificationResponse } from './classification.response';
import { ClassificationDto } from './dto/classification.dto';

/**
 * Lives under `reports` because that is what it is about; it is a separate
 * controller so the classification module stays a leaf and `reports` never has
 * to import it.
 */
@ApiTags('reports')
@Controller('reports')
export class ClassificationController {
  constructor(private readonly classification: ClassificationService) {}

  @Post(':id/classify')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(StaffGuard)
  @DispatcherOnly()
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Staff login required.' })
  @ApiForbiddenResponse({ description: 'Dispatcher or admin role required.' })
  @ApiNotFoundResponse({ description: 'Unknown report.' })
  @ApiOperation({
    operationId: 'classifyReport',
    summary: 'Classify a report again, now',
    description: 'Recomputes the triage proposal for the current report version and returns it. Advisory only: the report itself is unchanged, and the dispatcher still confirms through triage. A failed model call falls back to the rule classifier rather than leaving the request pending.',
  })
  @ApiOkResponse({ description: 'The proposal for the current report version.', type: ClassificationDto })
  async klasifikuj(@Param('id', new ParseUUIDPipe()) id: string): Promise<ClassificationDto> {
    return classificationResponse(await this.classification.klasifikujSada(id));
  }
}
