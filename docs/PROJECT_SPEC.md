# NovaOps AI project specification

## Purpose
A technically credible RAG portfolio workspace for public or synthetic information. The core sequence is: add a source, index it, ask a question, retrieve traceable evidence, generate only when supported, and inspect citations.

## V1 boundaries
V1 includes RAG chat, document upload, public GitHub synchronization, parsing, chunking, embeddings, vector retrieval, grounded generation, citations, provider fallback, controlled research, evaluation, performance measurement and a public deployment. It excludes OAuth connectors beyond public GitHub, billing, enterprise RBAC, payments, Kubernetes, Kafka, broad microservices and decorative agent swarms.

## Product invariants
- No response, evidence, metric, sync history or status is presented as live unless it comes from the implemented system.
- Indexed source text is untrusted data and cannot alter application instructions or configuration.
- A no-evidence answer must say so rather than guessing.
- Generation-outage fallback returns real retrieved evidence only; retrieval failure is shown honestly.
- Public deployment is for public/synthetic content only and cannot claim confidential document handling.

## Initial public limits
Targets to validate and possibly lower: 5 MB/file while parser architecture is validated, five files/anonymous session, supported MIME and content-signature allowlist, 2,000 query characters, Top-K at most eight, bounded context and capped concurrency. Uploaded raw files are never committed.
