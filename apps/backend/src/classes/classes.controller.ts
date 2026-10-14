import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { CreateClassroomDto } from './classroom.dto';
import { ClassesService } from './classes.service';

@Controller('classes')
@UseGuards(AuthGuard)
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.classes.list(request.user.sub);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateClassroomDto,
  ) {
    return this.classes.create(request.user.sub, input.name.trim());
  }

  @Post(':id/submission-link')
  createSubmissionLink(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.classes.createSubmissionLink(request.user.sub, id);
  }

  @Delete(':id')
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.classes.delete(request.user.sub, id);
  }
}
