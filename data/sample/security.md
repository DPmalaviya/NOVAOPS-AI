# Security Notes

## Secrets

All API keys stay server-side in environment variables and are never exposed in frontend code or committed to the repository. An example environment file documents the required variable names without real values.

## Prompt injection

All indexed documents are treated as untrusted content. Retrieved document text must not override the system instructions, expose secrets, request credentials, change provider configuration, or disable security policies. The generation prompt instructs the model to treat retrieved documents as data rather than instructions, and the evaluation dataset includes prompt-injection attempts.

## Upload safety

Uploads are validated against a MIME and extension allowlist and a maximum file size. Markdown rendering is sanitized, CORS is restricted, security headers are set, and errors returned to users never contain secrets or internal stack traces.
