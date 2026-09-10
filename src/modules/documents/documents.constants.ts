import { DocumentType } from '../../generated/prisma/client';

/** S5 document types visible to ProjectLine viewers (list + download). */
export const PROJECT_LINE_VISIBLE_DOCUMENT_TYPES: ReadonlySet<DocumentType> =
  new Set([DocumentType.CV, DocumentType.CERTIFICATE]);
