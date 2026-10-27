import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const signRoute = readFileSync('src/app/api/requests/[id]/sign/route.ts', 'utf8');
const updateRoute = readFileSync('src/app/api/requests/[id]/route.ts', 'utf8');
const listRoute = readFileSync('src/app/api/requests/route.ts', 'utf8');

describe('request route regression guards', () => {
  it('does not replace explicit zero signing geometry with defaults', () => {
    expect(signRoute).toContain('body?.page_number ?? 1');
    expect(signRoute).toContain('body?.width ?? 140');
    expect(signRoute).toContain('body?.height ?? 60');
    expect(signRoute).not.toContain('body?.page_number || 1');
  });

  it('validates manual signed PDFs as one complete upload', () => {
    expect(updateRoute).toContain('signedFile.size <= 0');
    expect(updateRoute).toContain('signedFile.type !== "application/pdf"');
    expect(updateRoute).toContain('PDFDocument.load(fileData)');
    expect(updateRoute).toContain('current.kind !== "document_signature" || target !== "completed"');
  });

  it('reserves closed_at for requester-confirmed closure and hides internal counts', () => {
    expect(updateRoute).toContain("closed_at=CASE WHEN status='closed' THEN closed_at ELSE NULL END");
    expect(updateRoute).not.toContain("$1 IN ('closed','rejected')");
    expect(listRoute).toContain("AND e.visibility='shared'");
  });
});
