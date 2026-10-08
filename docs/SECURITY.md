# Security and privacy posture

NovaOps is a public portfolio demonstration, not a confidential-document product. Its UI and documentation must ask users to upload only public, synthetic or otherwise non-sensitive content. That warning does not prove safe input, so the service minimizes retention and scope.

## Stage 1 controls
- No secrets in client source, repository or workflow files.
- `.env.example` documents names only; deployment secrets remain server-side.
- Worker responses use `nosniff` and no-store headers.
- The user interface does not fabricate operational data.

## Controls required before uploads
- Strict MIME plus signature checks, byte and extracted-text limits, supported-format allowlist, decompression limits and isolated temporary handling.
- Server-issued namespace/session ownership checks for all document and vector operations.
- Safe Markdown rendering, Content Security Policy, security headers, same-origin CORS, rate limits and bounded concurrency.
- Expiration cleanup and explicit deletion state.
- No raw documents, credentials or full sensitive prompts in logs.

## Prompt injection
Documents are untrusted data. Retrieval context cannot modify system rules, request secrets, call tools, alter provider configuration or access other namespaces. Adversarial documents and questions are mandatory evaluation cases.

## Remaining limitations
Browser-side extraction, if adopted, cannot ensure a source is non-sensitive and may not preserve all PDF structure. OCR and encrypted/scanned PDFs are out of scope until separately implemented and tested.
