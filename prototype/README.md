# NovaOps AI

Repository: `DPmalaviya/NOVAOPS-AI`

This repository starts with a lightweight UI prototype for NovaOps AI, a public RAG portfolio application.

## Core product flow

1. Add or synchronize documents
2. Parse, chunk, embed, and index them
3. Ask questions
4. Retrieve evidence
5. Generate grounded answers
6. Inspect citations

## Provider order

1. Gemini
2. Cloudflare Workers AI
3. Ollama Cloud (`nemotron-3-nano` preferred)
4. Retrieval-only evidence fallback

## Important

The current front-end is intentionally a prototype.

- Chat answers are simulated.
- Uploaded files remain in the browser.
- System metrics are demo placeholders.
- Production implementation must replace simulated behavior with tested services.

## Run the prototype

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## UI direction

The visual system is intentionally restrained:

- warm off-white canvas
- graphite typography
- muted steel-blue accents
- minimal status color
- no bright gradients or flashy dashboard decoration

The goal is a credible AI engineering product rather than a marketing-heavy demo.
