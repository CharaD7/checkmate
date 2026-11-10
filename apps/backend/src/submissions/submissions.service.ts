import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { rename, unlink } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { hashSubmissionCode } from '../classes/submission-code';
import { PrismaService } from '../prisma/prisma.service';
import { extractDocumentPages } from './document-extractor';
import { comparePages, compareText, PageMatch } from './similarity';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 10;
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx']);

interface UploadedFile {
  fieldname: string;
  originalname: string;
  path: string;
  size: number;
}

export interface WebSource {
  title: string;
  url: string;
  description: string;
  matchedPhrase: string;
  pageNumber: number;
  verifiedMatches: Array<{
    text: string;
    sourceText: string;
    matchedPhraseCount: number;
    lineScorePercent: number;
  }>;
}

export interface ArchiveComparison {
  id: string;
  left: {
    id: string;
    studentName: string;
    originalName: string;
    classroomName: string;
    pageCount: number;
  };
  right: {
    id: string;
    studentName: string;
    originalName: string;
    classroomName: string;
    pageCount: number;
  };
  similarityPercent: number;
  rightSimilarityPercent: number;
  sharedPhraseCount: number;
  pageCount: number;
  matchedPageCount: number;
  matches: PageMatch[];
}

interface BraveResult {
  title?: unknown;
  url?: unknown;
  description?: unknown;
}

interface BraveResponse {
  web?: { results?: BraveResult[] };
}

const MAX_QUERIES_PER_PAGE = 3;
const MAX_WEB_QUERIES = 12;
const MAX_WEB_SOURCES = 30;
const WORDS_PER_QUERY = 8;

@Injectable()
export class SubmissionsService {
  private readonly logger = new Logger(SubmissionsService.name);
  private webSearchQueue: Promise<void> = Promise.resolve();
  private lastWebQueryAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async publicClass(code: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { submissionCodeHash: hashSubmissionCode(code) },
      select: { name: true },
    });
    if (!classroom) throw new NotFoundException('This submission link is no longer available.');
    return classroom;
  }

  async uploadWithCode(
    code: string,
    files: UploadedFile[],
    studentNameValue: unknown,
    webCheckConsent: boolean,
  ) {
    try {
      const [studentName] = this.parseNames([studentNameValue], 1);
      const classroom = await this.prisma.classroom.findUnique({
        where: { submissionCodeHash: hashSubmissionCode(code) },
        select: { id: true, ownerId: true },
      });
      if (!classroom) {
        throw new NotFoundException('This submission link is no longer available.');
      }
      const receiptToken = randomBytes(32).toString('base64url');
      const submissions = await this.upload(
        classroom.ownerId,
        classroom.id,
        files,
        JSON.stringify(files.map(() => studentName)),
        webCheckConsent,
        hashSubmissionCode(receiptToken),
      );
      return { receiptToken, submissions };
    } catch (error) {
      await this.removeFiles(files.map((file) => file.path));
      throw error;
    }
  }

  async upload(
    ownerId: string,
    classroomId: string,
    files: UploadedFile[],
    namesValue: unknown,
    webCheckConsent = true,
    receiptCodeHash?: string,
  ) {
    const root = resolve(process.env.UPLOAD_DIR ?? '../../storage/uploads');
    const finalPaths: string[] = [];
    const staged: Array<{
      id: string;
      path: string;
      originalName: string;
      mimeType: string;
      fileSize: number;
      studentName: string;
      plainText: string;
      pageTexts: string[];
    }> = [];
    let committed = false;

    try {
      const classroom = await this.prisma.classroom.findFirst({
        where: { id: classroomId, ownerId },
        select: { id: true },
      });
      if (!classroom) throw new NotFoundException('Class not found.');
      if (files.length === 0 || files.length > MAX_FILES_PER_UPLOAD) {
        throw new BadRequestException('Choose between 1 and 10 files per upload.');
      }
      if (files.some((file) => file.fieldname !== 'files')) {
        throw new BadRequestException('Unexpected upload field.');
      }
      const names = this.parseNames(namesValue, files.length);

      for (const [index, file] of files.entries()) {
        if (file.size > MAX_FILE_SIZE) {
          throw new BadRequestException('Each file must be 25 MB or smaller.');
        }
        const extension = extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(extension)) {
          throw new BadRequestException('Only PDF and DOCX files are supported.');
        }

        const pageTexts = await extractDocumentPages(
          file.path,
          extension as '.pdf' | '.docx',
        );
        const plainText = pageTexts.join('\n').trim();
        if (plainText.trim().length < 20) {
          throw new BadRequestException(
            `${file.originalname} does not contain enough readable text to compare.`,
          );
        }

        const id = randomUUID();
        const storagePath = `${id}${extension}`;
        const destination = resolve(root, storagePath);
        await rename(file.path, destination);
        finalPaths.push(destination);
        staged.push({
          id,
          path: storagePath,
          originalName: file.originalname,
          mimeType:
            extension === '.pdf'
              ? 'application/pdf'
              : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSize: file.size,
          studentName: names[index],
          plainText,
          pageTexts,
        });
      }

      const created = await this.prisma.$transaction(async (transaction) => {
        const created = await Promise.all(
          staged.map((submission) =>
            transaction.submission.create({
              data: {
                id: submission.id,
                studentName: submission.studentName,
                originalName: submission.originalName,
                mimeType: submission.mimeType,
                fileSize: submission.fileSize,
                storagePath: submission.path,
                plainText: submission.plainText,
                pageTexts: JSON.stringify(submission.pageTexts),
                receiptCodeHash,
                classroomId,
              },
              select: {
                id: true,
                studentName: true,
                originalName: true,
                fileSize: true,
                createdAt: true,
                webSearchStatus: true,
                webSearchResults: true,
                webSearchError: true,
              },
            }),
          ),
        );
        await transaction.classroom.update({
          where: { id: classroomId },
          data: { updatedAt: new Date() },
        });
        return created;
      });
      committed = true;
      for (const submission of staged) {
        if (webCheckConsent) {
          this.enqueueWebSearch(
            submission.id,
            submission.pageTexts,
            submission.studentName,
          );
        } else {
          void this.saveWebSearch(
            submission.id,
            'SKIPPED',
            [],
            'Public web check was not requested.',
          ).catch(() => {
            this.logger.error(
              `Public web check preference could not be saved for submission ${submission.id}.`,
            );
          });
        }
      }
      return this.prisma.submission.findMany({
        where: { id: { in: created.map((submission) => submission.id) } },
        select: {
          id: true,
          studentName: true,
          originalName: true,
          fileSize: true,
          createdAt: true,
          webSearchStatus: true,
          webSearchResults: true,
          webSearchError: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      if (!committed) await this.removeFiles(finalPaths);
      throw error;
    } finally {
      await this.removeFiles(files.map((file) => file.path));
    }
  }

  async report(ownerId: string, classroomId: string) {
    const [classroom, instructorDocuments] = await Promise.all([
      this.prisma.classroom.findFirst({
        where: { id: classroomId, ownerId },
        include: {
          documents: {
            select: {
              id: true,
              studentName: true,
              originalName: true,
              fileSize: true,
              plainText: true,
              pageTexts: true,
              storagePath: true,
              createdAt: true,
              webSearchStatus: true,
              webSearchResults: true,
              webSearchError: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.prisma.submission.findMany({
        where: { classroom: { ownerId } },
        select: {
          id: true,
          classroomId: true,
          studentName: true,
          originalName: true,
          plainText: true,
          pageTexts: true,
          storagePath: true,
          classroom: { select: { name: true } },
        },
      }),
    ]);
    if (!classroom) throw new NotFoundException('Class not found.');

    const classDocuments = await Promise.all(
      classroom.documents.map((document) => this.withPageTexts(document)),
    );
    const archiveDocuments = await Promise.all(
      instructorDocuments.map((document) => this.withPageTexts(document)),
    );
    const comparisons: ArchiveComparison[] = [];
    const archivePageMatches = new Map<string, Set<number>>();
    for (const left of classDocuments) {
      for (const right of instructorDocuments) {
        if (left.id === right.id) continue;
        if (
          left.id.localeCompare(right.id) > 0 &&
          classroom.id === right.classroomId
        ) {
          continue;
        }
        const rightDocument = archiveDocuments.find(
          (document) => document.id === right.id,
        );
        if (!rightDocument) continue;
        const result = comparePages(left.pageTexts, rightDocument.pageTexts);
        for (const match of result.matches) {
          this.markPage(archivePageMatches, left.id, match.pageNumber);
          this.markPage(archivePageMatches, right.id, match.sourcePageNumber);
        }
        const matchedRightPages = new Set(
          result.matches.map((match) => match.sourcePageNumber),
        );
        comparisons.push({
          id: `${left.id}:${right.id}`,
          left: {
            id: left.id,
            studentName: left.studentName,
            originalName: left.originalName,
            classroomName: classroom.name,
            pageCount: left.pageTexts.length,
          },
          right: {
            id: right.id,
            studentName: right.studentName,
            originalName: right.originalName,
            classroomName: right.classroom.name,
            pageCount: rightDocument.pageTexts.length,
          },
          ...result,
          rightSimilarityPercent:
            rightDocument.pageTexts.length === 0
              ? 0
              : Math.round(
                  (matchedRightPages.size / rightDocument.pageTexts.length) *
                    100,
                ),
        });
      }
    }
    comparisons.sort(
      (left, right) => right.similarityPercent - left.similarityPercent,
    );

    return {
      classroom: { id: classroom.id, name: classroom.name },
      submissions: classDocuments.map((document) => {
        const webSearchResults = this.parseWebSources(document.webSearchResults);
        const archivedPages =
          archivePageMatches.get(document.id) ?? new Set<number>();
        const webPages = new Set(
          webSearchResults
            .filter((source) => source.verifiedMatches.length > 0)
            .map((source) => source.pageNumber)
            .filter((pageNumber) => pageNumber > 0),
        );
        const matchedPages = new Set([...archivedPages, ...webPages]);
        const pageCount = document.pageTexts.length;
        const {
          plainText: _plainText,
          pageTexts: _pageTexts,
          storagePath: _storagePath,
          webSearchResults: _storedWebResults,
          ...metadata
        } = document;
        return {
          ...metadata,
          webSearchResults,
          pageCount,
          archiveMatchedPageCount: archivedPages.size,
          webMatchedPageCount: webPages.size,
          matchedPageCount: matchedPages.size,
          similarityPercent:
            pageCount === 0
              ? 0
              : Math.round((matchedPages.size / pageCount) * 100),
        };
      }),
      comparisons,
      method: {
        name: 'Page-level exact phrase overlap',
        caveat:
        'The percentage is the share of rendered pages with at least one exact shared five-word phrase in the instructor archive or a Brave result excerpt. Public-web matches are verified only against the search-result excerpt, not the full source page, and cover a limited sample of the public index. Search leads without an excerpt overlap are not scored. Matches are evidence for review, not findings of plagiarism.',
      },
    };
  }

  async studentReceipt(receiptToken: string) {
    const receiptCodeHash = hashSubmissionCode(receiptToken);
    const receiptSubmissions = await this.prisma.submission.findMany({
      where: { receiptCodeHash },
      select: {
        id: true,
        studentName: true,
        originalName: true,
        plainText: true,
        pageTexts: true,
        storagePath: true,
        createdAt: true,
        webSearchStatus: true,
        webSearchResults: true,
        webSearchError: true,
        classroom: {
          select: { name: true, ownerId: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (receiptSubmissions.length === 0) {
      throw new NotFoundException('This submission receipt is unavailable.');
    }

    const ownerIds = [
      ...new Set(receiptSubmissions.map((item) => item.classroom.ownerId)),
    ];
    const archiveRows = await this.prisma.submission.findMany({
      where: { classroom: { ownerId: { in: ownerIds } } },
      select: {
        id: true,
        plainText: true,
        pageTexts: true,
        storagePath: true,
        originalName: true,
        classroom: { select: { ownerId: true } },
      },
    });
    const [documents, archiveDocuments] = await Promise.all([
      Promise.all(receiptSubmissions.map((item) => this.withPageTexts(item))),
      Promise.all(archiveRows.map((item) => this.withPageTexts(item))),
    ]);

    return {
      classroomName: receiptSubmissions[0].classroom.name,
      submissions: documents.map((document) => {
        const pageMatches: Array<{
          pageNumber: number;
          text: string;
          matchedPhraseCount: number;
          pageSimilarityPercent: number;
          lineScorePercent: number;
          source: 'Instructor archive';
        }> = [];
        for (const source of archiveDocuments) {
          if (
            source.classroom.ownerId !== document.classroom.ownerId ||
            source.id === document.id
          ) {
            continue;
          }
          const result = comparePages(document.pageTexts, source.pageTexts);
          for (const match of result.matches) {
            pageMatches.push({
              pageNumber: match.pageNumber,
              text: match.text,
              matchedPhraseCount: match.matchedPhraseCount,
              pageSimilarityPercent: match.pageSimilarityPercent,
              lineScorePercent: match.lineScorePercent,
              source: 'Instructor archive',
            });
          }
        }
        const webSearchResults = this.parseWebSources(document.webSearchResults);
        const archivePages = new Set(
          pageMatches.map((match) => match.pageNumber),
        );
        const webPages = new Set(
          webSearchResults
            .filter((source) => source.verifiedMatches.length > 0)
            .map((source) => source.pageNumber)
            .filter((pageNumber) => pageNumber > 0),
        );
        const matchedPages = new Set([...archivePages, ...webPages]);
        const pageCount = document.pageTexts.length;
        return {
          id: document.id,
          studentName: document.studentName,
          originalName: document.originalName,
          createdAt: document.createdAt,
          webSearchStatus: document.webSearchStatus,
          webSearchError: document.webSearchError,
          webSearchResults,
          archiveMatches: pageMatches,
          pageCount,
          archiveMatchedPageCount: archivePages.size,
          webMatchedPageCount: webPages.size,
          matchedPageCount: matchedPages.size,
          similarityPercent:
            pageCount === 0
              ? 0
              : Math.round((matchedPages.size / pageCount) * 100),
        };
      }),
      method:
        'The percentage is the share of pages with at least one exact five-word archive match or a matching phrase in a Brave result excerpt. Web matches are verified against the search-result excerpt, not the full source page, and cover a limited public-index sample. Search leads without an excerpt overlap are not scored. This is a review signal, not a finding of plagiarism.',
    };
  }

  async rerunWebSearch(ownerId: string, classroomId: string, submissionId: string) {
    const submission = await this.prisma.submission.findFirst({
      where: { id: submissionId, classroomId, classroom: { ownerId } },
      select: {
        id: true,
        plainText: true,
        pageTexts: true,
        storagePath: true,
        originalName: true,
        studentName: true,
      },
    });
    if (!submission) throw new NotFoundException('Submission not found.');
    const document = await this.withPageTexts(submission);
    await this.saveWebSearch(
      submission.id,
      'PENDING',
      [],
      null,
    );
    await this.enqueueWebSearch(
      submission.id,
      document.pageTexts,
      submission.studentName,
    );
    const updated = await this.prisma.submission.findUniqueOrThrow({
      where: { id: submission.id },
      select: {
        id: true,
        webSearchStatus: true,
        webSearchResults: true,
        webSearchError: true,
      },
    });
    return {
      ...updated,
      webSearchResults: this.parseWebSources(updated.webSearchResults),
    };
  }

  async delete(ownerId: string, classroomId: string, submissionId: string) {
    const submission = await this.prisma.submission.findFirst({
      where: {
        id: submissionId,
        classroomId,
        classroom: { ownerId },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found.');

    await this.prisma.submission.delete({ where: { id: submissionId } });
    await this.removeFiles([
      resolve(process.env.UPLOAD_DIR ?? '../../storage/uploads', submission.storagePath),
    ]);
    return { id: submissionId };
  }

  private parseNames(value: unknown, count: number): string[] {
    let names: unknown;
    try {
      names = typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      throw new BadRequestException('Student names must be sent as a JSON list.');
    }
    if (
      !Array.isArray(names) ||
      names.length !== count ||
      names.some(
        (name) =>
          typeof name !== 'string' ||
          name.trim().length < 1 ||
          name.trim().length > 120,
      )
    ) {
      throw new BadRequestException(
        'Enter one student name (1–120 characters) for each selected file.',
      );
    }
    return names.map((name: string) => name.trim());
  }

  private async withPageTexts<
    T extends {
      id: string;
      pageTexts: string | null;
      plainText: string;
      storagePath: string;
      originalName: string;
    },
  >(document: T): Promise<Omit<T, 'pageTexts'> & { pageTexts: string[] }> {
    if (document.pageTexts) {
      const parsed = JSON.parse(document.pageTexts) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.every((page) => typeof page === 'string')
      ) {
        return { ...document, pageTexts: parsed };
      }
      throw new Error(`Stored page text is invalid for submission ${document.id}.`);
    }

    const extension = extname(document.originalName).toLowerCase();
    try {
      if (extension !== '.pdf' && extension !== '.docx') {
        throw new Error('Unsupported document format.');
      }
      const pages = await extractDocumentPages(
        resolve(process.env.UPLOAD_DIR ?? '../../storage/uploads', document.storagePath),
        extension,
      );
      await this.prisma.submission.update({
        where: { id: document.id },
        data: { pageTexts: JSON.stringify(pages) },
      });
      return { ...document, pageTexts: pages };
    } catch (error) {
      this.logger.error(
        `Unable to render ${extension} pages for submission ${document.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException(
        'A document’s pages could not be rendered for review. Re-upload it or ask the instructor to check the server document-renderer setup.',
      );
    }
  }

  private async runWebSearch(
    submissionId: string,
    pageTexts: string[],
    studentName: string,
  ) {
    const apiKey = this.config.get<string>('BRAVE_SEARCH_API_KEY');
    if (!apiKey) {
      await this.saveWebSearch(submissionId, 'NOT_CONFIGURED', [], 'Brave Search is not configured.');
      return;
    }

    const queries = buildBravePageQueries(pageTexts, studentName);
    const sources = new Map<string, WebSource>();
    let failure: string | null = null;
    try {
      for (const { query, pageNumber } of queries) {
        await this.waitForWebSearchSlot();
        const url = new URL('https://api.search.brave.com/res/v1/web/search');
        url.searchParams.set('q', `"${query}"`);
        url.searchParams.set('count', '5');
        const response = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'X-Subscription-Token': apiKey,
          },
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) {
          failure =
            response.status === 401 || response.status === 403
              ? 'Brave Search rejected the API key. Check its configuration.'
              : response.status === 429
                ? 'Brave Search rate limit reached. Try again later.'
                : `Brave Search returned HTTP ${response.status}. Try again later.`;
          break;
        }
        const payload = (await response.json()) as BraveResponse;
        for (const result of payload.web?.results ?? []) {
          if (
            typeof result.title !== 'string' ||
            typeof result.url !== 'string' ||
            typeof result.description !== 'string'
          ) {
            continue;
          }
          let sourceUrl: URL;
          try {
            sourceUrl = new URL(result.url);
          } catch {
            continue;
          }
          if (sourceUrl.protocol !== 'https:' && sourceUrl.protocol !== 'http:') {
            continue;
          }
          const description = result.description.slice(0, 800);
          const verification = compareText(
            pageTexts[pageNumber - 1] ?? '',
            description,
          );
          sources.set(`${result.url}:${pageNumber}`, {
            title: result.title.slice(0, 300),
            url: result.url,
            description,
            matchedPhrase: query,
            pageNumber,
            verifiedMatches: verification.passages.map((passage) => ({
              text: passage.left,
              sourceText: passage.right,
              matchedPhraseCount: passage.matchedPhraseCount,
              lineScorePercent: Math.round(
                (passage.matchedPhraseCount / verification.leftPhraseCount) *
                  100,
              ),
            })),
          });
        }

      }
    } catch {
      failure = 'Brave Search could not be reached. Try again later.';
    }

    if (failure) {
      this.logger.warn(`Public web check failed for submission ${submissionId}.`);
      await this.saveWebSearch(submissionId, 'FAILED', [], failure);
      return;
    }
    await this.saveWebSearch(
      submissionId,
      'COMPLETE',
      [...sources.values()].slice(0, MAX_WEB_SOURCES),
      null,
    );
  }

  private enqueueWebSearch(
    submissionId: string,
    pageTexts: string[],
    studentName: string,
  ): Promise<void> {
    this.webSearchQueue = this.webSearchQueue
      .then(() => this.runWebSearch(submissionId, pageTexts, studentName))
      .catch(() => {
        this.logger.error(
          `Public web check could not be saved for submission ${submissionId}.`,
        );
      });
    return this.webSearchQueue;
  }

  private async waitForWebSearchSlot() {
    const delay = 1_100 - (Date.now() - this.lastWebQueryAt);
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    this.lastWebQueryAt = Date.now();
  }

  private saveWebSearch(
    submissionId: string,
    status: string,
    results: WebSource[],
    error: string | null,
  ) {
    return this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        webSearchStatus: status,
        webSearchResults: JSON.stringify(results),
        webSearchError: error,
      },
    });
  }

  private parseWebSources(value: string | null): WebSource[] {
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error('Stored public web results are invalid.');
    }
    return parsed.map((item) => {
      if (!item || typeof item !== 'object') {
        throw new Error('Stored public web results are invalid.');
      }
      const source = item as Partial<WebSource>;
      if (
        typeof source.title !== 'string' ||
        typeof source.url !== 'string' ||
        typeof source.description !== 'string' ||
        typeof source.matchedPhrase !== 'string'
      ) {
        throw new Error('Stored public web results are invalid.');
      }
      return {
        title: source.title,
        url: source.url,
        description: source.description,
        matchedPhrase: source.matchedPhrase,
        verifiedMatches: Array.isArray(source.verifiedMatches)
          ? source.verifiedMatches.map((match) => {
              if (
                !match ||
                typeof match !== 'object' ||
                typeof match.text !== 'string' ||
                typeof match.sourceText !== 'string' ||
                !Number.isInteger(match.matchedPhraseCount) ||
                !Number.isInteger(match.lineScorePercent)
              ) {
                throw new Error('Stored public web match evidence is invalid.');
              }
              return {
                text: match.text,
                sourceText: match.sourceText,
                matchedPhraseCount: match.matchedPhraseCount,
                lineScorePercent: match.lineScorePercent,
              };
            })
          : [],
        pageNumber:
          Number.isInteger(source.pageNumber) && (source.pageNumber ?? 0) > 0
            ? source.pageNumber!
            : 0,
      };
    });
  }

  private markPage(
    matchesByDocument: Map<string, Set<number>>,
    documentId: string,
    pageNumber: number,
  ) {
    const pages = matchesByDocument.get(documentId) ?? new Set<number>();
    pages.add(pageNumber);
    matchesByDocument.set(documentId, pages);
  }

  private async removeFiles(paths: string[]) {
    const results = await Promise.allSettled(paths.map((path) => unlink(path)));
    for (const result of results) {
      if (
        result.status === 'rejected' &&
        (result.reason as NodeJS.ErrnoException).code !== 'ENOENT'
      ) {
        this.logger.error('A stored upload could not be removed.', result.reason);
      }
    }
  }
}

export function buildBraveQueries(text: string, studentName: string): string[] {
  const escapedName = studentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safeText = text
    .replace(new RegExp(escapedName, 'giu'), ' | ')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, ' | ')
    .replace(/\b(?:https?:\/\/|www\.)\S+/giu, ' | ')
    .replace(/\+?\d[\d\s().-]{7,}\d/gu, ' | ');
  const windows: string[] = [];
  for (const segment of safeText.split('|')) {
    const words =
      segment.match(/[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu) ?? [];
    let lowerCaseRun: string[] = [];
    const saveRunWindows = () => {
      for (
        let start = 0;
        start <= lowerCaseRun.length - WORDS_PER_QUERY;
        start += 1
      ) {
        windows.push(
          lowerCaseRun.slice(start, start + WORDS_PER_QUERY).join(' '),
        );
      }
      lowerCaseRun = [];
    };
    for (const word of words) {
      if (word !== word.toLocaleLowerCase()) {
        saveRunWindows();
      } else {
        lowerCaseRun.push(word);
      }
    }
    saveRunWindows();
  }
  const uniqueWindows = [...new Set(windows)];
  if (uniqueWindows.length <= MAX_QUERIES_PER_PAGE) return uniqueWindows;
  return Array.from({ length: MAX_QUERIES_PER_PAGE }, (_, index) => {
    const position = Math.round(
      (index * (uniqueWindows.length - 1)) / (MAX_QUERIES_PER_PAGE - 1),
    );
    return uniqueWindows[position];
  }).filter((query, index, all) => all.indexOf(query) === index);
}

export function buildBravePageQueries(
  pageTexts: string[],
  studentName: string,
): Array<{ pageNumber: number; query: string }> {
  const candidates = pageTexts.flatMap((pageText, index) =>
    buildBraveQueries(pageText, studentName).map((query) => ({
      pageNumber: index + 1,
      query,
    })),
  );
  if (candidates.length <= MAX_WEB_QUERIES) return candidates;
  return Array.from({ length: MAX_WEB_QUERIES }, (_, index) => {
    const position = Math.round(
      (index * (candidates.length - 1)) / (MAX_WEB_QUERIES - 1),
    );
    return candidates[position];
  }).filter(
    (candidate, index, all) =>
      all.findIndex(
        (other) =>
          other.pageNumber === candidate.pageNumber &&
          other.query === candidate.query,
      ) === index,
  );
}
