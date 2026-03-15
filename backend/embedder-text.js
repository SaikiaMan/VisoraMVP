const EMBEDDING_MODEL = 'gemini-embedding-001';

/**
 * @param {Array<string>} textChunks
 * @returns {Promise<Array<{ embedding: number[], chunk: string }>>}
 */
async function embedTexts(textChunks) {
  if (!Array.isArray(textChunks) || textChunks.length === 0) {
    throw new Error("textChunks must be a non-empty array");
  }

  if (!process.env.GOOGLE_API_KEY) {
    throw new Error(
      'GOOGLE_API_KEY is not set. Please add it to your .env file before running the app.'
    );
  }

  console.log(`Embedding ${textChunks.length} chunks...`);

  try {
    const results = [];
    for (const chunk of textChunks) {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${process.env.GOOGLE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text: chunk }] },
          }),
        }
      );
      const data = await resp.json();
      if (!data.embedding || !data.embedding.values) {
        throw new Error(`Embedding API error: ${JSON.stringify(data)}`);
      }
      results.push({ chunk, embedding: data.embedding.values });
    }
    return results;
  } catch (error) {
    console.error('Error while calling Google embedding API:', error);
    throw new Error(
      `Failed to embed texts. ${(error && error.message) || ''}`.trim()
    );
  }
}

export { embedTexts };
