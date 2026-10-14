import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { hashSubmissionCode } from './submission-code';

@Injectable()
export class ClassesService {
  private readonly logger = new Logger(ClassesService.name);

  constructor(private readonly prisma: PrismaService) {}

  list(ownerId: string) {
    return this.prisma.classroom.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { documents: true } } },
    });
  }

  create(ownerId: string, name: string) {
    return this.prisma.classroom.create({
      data: { name, ownerId },
      include: { _count: { select: { documents: true } } },
    });
  }

  async createSubmissionLink(ownerId: string, classroomId: string) {
    const classroom = await this.prisma.classroom.findFirst({
      where: { id: classroomId, ownerId },
      select: { id: true },
    });
    if (!classroom) throw new NotFoundException('Class not found.');

    const code = randomBytes(32).toString('base64url');
    await this.prisma.classroom.update({
      where: { id: classroomId },
      data: { submissionCodeHash: hashSubmissionCode(code) },
    });
    return { code };
  }

  async delete(ownerId: string, classroomId: string) {
    const classroom = await this.prisma.classroom.findFirst({
      where: { id: classroomId, ownerId },
      include: { documents: { select: { storagePath: true } } },
    });
    if (!classroom) {
      throw new NotFoundException('Class not found.');
    }

    await this.prisma.classroom.delete({ where: { id: classroom.id } });
    const root = resolve(process.env.UPLOAD_DIR ?? '../../storage/uploads');
    const removals = await Promise.allSettled(
      classroom.documents.map((document) =>
        unlink(resolve(root, document.storagePath)),
      ),
    );
    for (const removal of removals) {
      if (removal.status === 'rejected' && removal.reason?.code !== 'ENOENT') {
        this.logger.error('Unable to remove a stored file after class deletion.', removal.reason);
      }
    }
    return { id: classroom.id };
  }

}
