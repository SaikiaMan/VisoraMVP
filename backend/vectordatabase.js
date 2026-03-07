import { Pinecone } from '@pinecone-database/pinecone';
import { embedTexts } from './embedder-text.js';

const DB_INDEX = 'rag-langchain-nodejs';
const NAMESPACE = 'test-namespace';

if (!process.env.PINECONE_API_KEY) {
  throw new Error(
    'PINECONE_API_KEY is not set. Please add it to your .env file before running the app.'
  );
}

// https://docs.pinecone.io/guides/get-started/quickstart
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

async function checkIndexExists() {
  try {
    const indexList = await pc.listIndexes();
    return indexList.indexes.some((index) => index.name === DB_INDEX);
  } catch (error) {
    console.error('Error checking index existence:', error);
    return false;
  }
}

async function createIndex() {
  try {
    await pc.createIndex({
      name: DB_INDEX,
      dimension: 3072, // text-embedding-3-large
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1',
        },
      },
    });
    console.log('Index created successfully');
  } catch (error) {
    console.error('Error creating index:', error);
  }
}

async function describeIndexStats() {
  try {
    const index = pc.index(DB_INDEX);
    const stats = await index.describeIndexStats();
    return stats;
  } catch (error) {
    console.error('Error describing index stats:', error);
    return null;
  }
}

async function storeEmbeddings(embeddingsDataArr) {
  try {
    if (!Array.isArray(embeddingsDataArr) || embeddingsDataArr.length === 0) {
      console.warn('No embeddings to store (received empty array). Skipping upsert.');
      return;
    }

    const index = pc.index(DB_INDEX);
    const vectors = embeddingsDataArr.map((data, id) => ({
      id: `vec_${id}`,
      values: data.embedding,
      metadata: { chunk: data.chunk },
    }));
    await index.namespace(NAMESPACE).upsert(vectors);
    console.log('Embeddings stored successfully');
  } catch (error) {
    console.error('Error storing embeddings:', error);
  }
}

async function retrieveRelevantChunks(query) {
  try {
    const queryEmbedding = await embedTexts([query]);
    const index = pc.index(DB_INDEX);
    const queryResponse = await index.namespace(NAMESPACE).query({
      vector: queryEmbedding[0].embedding,
      topK: 5,
      includeMetadata: true,
    });
    return queryResponse.matches.map((match) => match.metadata.chunk);
  } catch (error) {
    console.error('Error retrieving relevant chunks:', error);
    return [];
  }
}

export {
  storeEmbeddings,
  createIndex,
  describeIndexStats,
  retrieveRelevantChunks,
  checkIndexExists,
};
