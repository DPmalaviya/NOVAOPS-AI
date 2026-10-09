# Ingestion and GitHub Sync

## Supported documents

NovaOps supports PDF, DOCX, TXT, Markdown, and CSV documents. For each document the system tracks the document ID, filename, source, size, processing state, chunk count, content hash, indexed timestamp, and an error reason when processing fails.

## Incremental GitHub sync

The GitHub connector syncs a public repository and branch. It discovers supported files, and uses the blob SHA as the reliable source identity for each file. On an incremental sync, unchanged files are skipped because their blob SHA matches the stored version, so they are not re-parsed and do not generate new embeddings. Changed files are re-indexed, and only the affected content is updated. Files deleted from the repository are removed from the index, so deleted content no longer appears in retrieval. Synchronization is idempotent: running a second sync with no changes creates no duplicate records and no duplicate vectors.

## Upload limits

Public uploads are limited to protect the free demonstration. The maximum file size is 10 MB per file and at most 5 files per anonymous session. Uploaded files are never committed to GitHub, and temporary uploads are cleaned up.
