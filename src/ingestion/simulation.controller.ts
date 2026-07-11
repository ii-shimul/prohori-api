import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard';
import { ScenarioCode, SimulationService } from './simulation.service';

@Controller('simulation')
@UseGuards(SupabaseJwtGuard)
export class SimulationController {
  constructor(private readonly simulation: SimulationService) {}

  @Post('reset')
  reset(@CurrentUser() user: AuthenticatedUser) {
    return this.simulation.reset(user);
  }

  @Post('start')
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { scenario?: ScenarioCode },
  ) {
    return this.simulation.start(user, scenario(body));
  }

  @Post('step')
  step(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { scenario?: ScenarioCode },
  ) {
    return this.simulation.step(user, scenario(body));
  }
}

function scenario(body: { scenario?: ScenarioCode }): ScenarioCode {
  if (!body || !['A', 'B', 'C', 'D'].includes(body.scenario ?? '')) {
    throw new BadRequestException({
      code: 'INVALID_SCENARIO',
      message: 'scenario must be one of A, B, C, or D.',
    });
  }
  return body.scenario!;
}
