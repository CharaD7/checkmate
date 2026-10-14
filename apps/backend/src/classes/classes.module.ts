import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthGuard } from '../auth/auth.guard';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports: [AuthModule],
  controllers: [ClassesController],
  providers: [ClassesService, AuthGuard],
  exports: [ClassesService],
})
export class ClassesModule {}
