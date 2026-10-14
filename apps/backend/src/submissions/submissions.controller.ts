import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { diskStorage } from 'multer';
import { resolve } from 'node:path';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { SubmissionsService } from './submissions.service';

@Controller('classes/:classId')
@UseGuards(AuthGuard)
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Get('report')
  report(
    @Req() request: AuthenticatedRequest,
    @Param('classId') classId: string,
  ) {
    return this.submissions.report(request.user.sub, classId);
  }

  @Post('submissions')
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: diskStorage({
        destination: resolve(
          process.env.UPLOAD_DIR ?? '../../storage/uploads',
          'tmp',
        ),
        filename: (_request, file, callback) => {
          const extension = file.originalname.match(/\.[^.]+$/)?.[0] ?? '';
          callback(null, `${randomUUID()}${extension.toLowerCase()}`);
        },
      }),
      limits: { files: 10, fileSize: 25 * 1024 * 1024 },
    }),
  )
  upload(
    @Req() request: AuthenticatedRequest,
    @Param('classId') classId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.submissions.upload(
      request.user.sub,
      classId,
      files ?? [],
      request.body.studentNames,
    );
  }

  @Post('submissions/:submissionId/web-check')
  rerunWebSearch(
    @Req() request: AuthenticatedRequest,
    @Param('classId') classId: string,
    @Param('submissionId') submissionId: string,
  ) {
    return this.submissions.rerunWebSearch(
      request.user.sub,
      classId,
      submissionId,
    );
  }

  @Delete('submissions/:submissionId')
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('classId') classId: string,
    @Param('submissionId') submissionId: string,
  ) {
    return this.submissions.delete(request.user.sub, classId, submissionId);
  }
}
