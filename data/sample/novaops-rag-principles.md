# NovaOps sample corpus

NovaOps returns answers only when retrieved evidence supports them. Semantic retrieval uses an embedding of the question and cosine vector search across chunk embeddings. Citations identify the actual document and retained chunk.

The provider router is not part of retrieval. Generation will be introduced only after retrieval verification passes. If retrieval is unavailable, NovaOps must say so rather than returning unrelated passages.
