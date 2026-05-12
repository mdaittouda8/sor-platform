// Extract text from uploaded documents (PDF, DOCX, TXT, MD, CSV, LOG)
// Caches the extracted text on the doc object so we only do the work once.

import * as pdfjsLib from 'pdfjs-dist/build/pdf';
// Vite-friendly way to get the worker as a URL
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import * as mammoth from 'mammoth/mammoth.browser';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

export function docKind(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (['txt', 'md', 'log'].includes(ext)) return 'txt';
  if (ext === 'csv') return 'csv';
  return 'other';
}

// Extract and return text content from a doc object { file, kind, extractedText }
// Caches into doc.extractedText so repeated calls are free.
export async function extractDocText(doc) {
  if (doc.extractedText !== null && doc.extractedText !== undefined) return doc.extractedText;

  if (doc.kind === 'pdf') {
    const buf = await doc.file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    // Cap at 60 pages to keep extraction snappy and avoid blasting the LLM's context
    const maxPages = Math.min(pdf.numPages, 60);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((it) => it.str).join(' '));
    }
    let text = pages.join('\n\n');
    if (pdf.numPages > maxPages) {
      text += `\n\n[... document tronqué : ${pdf.numPages - maxPages} pages supplémentaires non extraites]`;
    }
    doc.extractedText = text;
    return text;
  }

  if (doc.kind === 'docx') {
    const buf = await doc.file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    doc.extractedText = result.value || '';
    return doc.extractedText;
  }

  // txt, md, csv, log — plain text
  const text = await doc.file.text();
  doc.extractedText = text;
  return text;
}
