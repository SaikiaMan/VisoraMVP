import { OpenAIEmbeddings } from '@langchain/openai';

/**
 * @param {Array<string>} textChunks
 * @returns {Array<{ embedding: number[], chunk: string }>}
 */
async function embedTexts(textChunks) {
  if (!Array.isArray(textChunks) || textChunks.length === 0) {
    throw new Error("textChunks must be a non-empty array");
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is not set. Please add it to your .env file before running the app.'
    );
  }

  const embedder = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'text-embedding-3-large',
    batchSize: 512
  });

  console.log(`Embedding ${textChunks.length} chunks...`);

  try {
    // Use embedDocuments for batch processing
    const embeddings = await embedder.embedDocuments(textChunks);

    // Map embeddings back to their chunks
    const embeddingsDataArr = textChunks.map((chunk, index) => ({
      chunk,
      embedding: embeddings[index]
    }));

    return embeddingsDataArr;
  } catch (error) {
    console.error('Error while calling OpenAI embeddings API:', error);
    throw new Error(
      `Failed to embed texts using OpenAI embeddings. ${(error && error.message) || ''}`.trim()
    );
  }
}

export { embedTexts }
