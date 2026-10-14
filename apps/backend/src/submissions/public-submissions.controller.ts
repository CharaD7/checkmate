import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { diskStorage } from 'multer';
import { resolve } from 'node:path';
import { SubmissionsService } from './submissions.service';

@Controller('public/submissions')
@UseGuards(ThrottlerGuard)
export class PublicSubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Get('receipt/:receiptToken')
  getReceipt(@Param('receiptToken') receiptToken: string) {
    return this.submissions.studentReceipt(receiptToken);
  }

  @Get(':code')
  getClass(@Param('code') code: string) {
    return this.submissions.publicClass(code);
  }

  @Post(':code')
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
    @Param('code') code: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('studentName') studentName: unknown,
    @Body('webCheckConsent') webCheckConsent: unknown,
  ) {
    if (!files || files.length === 0 || files.length > 10) {
      throw new BadRequestException(
        'Submit between 1 and 10 PDF or DOCX documents at a time.',
      );
    }
    return this.submissions.uploadWithCode(
      code,
      files,
      studentName,
      webCheckConsent === 'true',
    );
  }
}
