import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthGuard } from '../auth/auth.guard';
import { PublicSubmissionsController } from './public-submissions.controller';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
  imports: [AuthModule],
  controllers: [SubmissionsController, PublicSubmissionsController],
  providers: [SubmissionsService, AuthGuard],
})
export class SubmissionsModule {}
