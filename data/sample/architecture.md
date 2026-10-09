# NovaOps AI Architecture

NovaOps AI is an AI knowledge workspace built around retrieval-augmented generation. The primary user flow is: add documents, index them, ask a question, retrieve evidence, generate a grounded answer, and inspect citations.

## Request flow

A user question is validated first, including a maximum question length. The question is embedded with the same embedding model that was used to index the documents. The query embedding is searched against the vector index, and the top-K most similar chunks are retrieved. Metadata filters can narrow retrieval to specific documents. The retrieved chunks become the context for the generation provider. The generated answer is mapped back to citations, and the response returns the answer together with the evidence so the user can inspect every claim.

## Indexing flow

Documents and GitHub files enter the ingestion pipeline. A parser extracts text while preserving page numbers, headings, and line ranges where the format provides them. A chunker splits the text into overlapping passages. An embedder converts each chunk into a vector. The vectors are stored in the vector index, and chunk metadata is stored in the metadata database.

## Components

The web application is a React and TypeScript single-page app. The API is a TypeScript worker that orchestrates retrieval and provider routing. Document and chunk metadata live in a relational store. Vectors live in a dedicated vector index. Python is used for offline evaluation and benchmark scripts rather than a second production API.
