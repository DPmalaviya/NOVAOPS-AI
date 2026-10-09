# Provider Routing and Fallback

NovaOps uses mostly cloud generation models with an explicit fallback order.

## Fallback order

The generation fallback order is: first Gemini, second Cloudflare Workers AI, third Ollama Cloud, and finally a retrieval-only response. Gemini is the primary provider because its free tier suits a public demonstration. Workers AI is the second provider and runs close to the API worker. Ollama Cloud is the third provider, and its preferred model is nemotron-3-nano, kept configurable in the environment.

## Router behavior

The provider router gives each provider a bounded timeout. Temporary failures, rate limits, and malformed responses may be retried once with backoff. Invalid credentials, invalid model IDs, and permanent configuration errors are never retried endlessly; the router moves directly to the next provider. Quota exhaustion on one provider moves the request to the next provider.

## Retrieval-only fallback

If Gemini fails and Workers AI fails and Ollama Cloud fails, NovaOps does not fail the request completely. It returns the retrieved evidence with source citations and a message explaining that generation is temporarily unavailable. The retrieval layer remains useful even when no generation provider is available.
