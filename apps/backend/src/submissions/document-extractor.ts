import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, parse } from 'node:path';
import { pathToFileURL } from 'node:url';
import pdfParse = require('pdf-parse');

const CONVERSION_TIMEOUT_MS = 45_000;

export async function extractDocumentPages(
  filePath: string,
  extension: '.pdf' | '.docx',
): Promise<string[]> {
  if (extension === '.pdf') {
    return extractPdfPages(await readFile(filePath));
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'checkmate-docx-'));
  try {
    await runLibreOffice(filePath, temporaryDirectory);
    const pdfPath = join(
      temporaryDirectory,
      `${parse(basename(filePath)).name}.pdf`,
    );
    return extractPdfPages(await readFile(pdfPath));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function extractPdfPages(buffer: Buffer): Promise<string[]> {
  const pages: string[] = [];
  await pdfParse(buffer, {
    pagerender: async (pageData: {
      getTextContent: (options: {
        normalizeWhitespace: boolean;
        disableCombineTextItems: boolean;
      }) => Promise<{ items: Array<{ str?: string }> }>;
    }) => {
      const content = await pageData.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      });
      pages.push(
        content.items
          .map((item) => item.str ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );
      return '';
    },
  });
  return pages;
}

function runLibreOffice(inputPath: string, outputDirectory: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.env.LIBREOFFICE_BIN ?? 'soffice',
      [
        '--headless',
        '--nologo',
        '--nodefault',
        '--nolockcheck',
        '--norestore',
        `-env:UserInstallation=${pathToFileURL(join(outputDirectory, 'profile')).href}`,
        '--convert-to',
        'pdf',
        '--outdir',
        outputDirectory,
        inputPath,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    let timeout: NodeJS.Timeout;
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-2000);
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Unable to start the DOCX page renderer (${error.message}).`,
        ),
      );
    });
    child.once('close', (exitCode) => {
      clearTimeout(timeout);
      if (exitCode === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `DOCX page rendering failed${stderr.trim() ? `: ${stderr.trim()}` : '.'}`,
          ),
        );
      }
    });
    timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('DOCX page rendering timed out.'));
    }, CONVERSION_TIMEOUT_MS);
  });
}
