import logger from './logger.js';

const namespaceChunks = new Map();

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function scoreChunk(queryTokens, chunk) {
  const haystack = normalizeText(chunk);
  if (!haystack.trim()) {
    return 0;
  }

  let score = 0;
  let matchCount = 0;

  for (const token of queryTokens) {
    if (!token) continue;
    
    // Exact word match with spaces (highest priority)
    const tokenPattern = ` ${token} `;
    const haystackWithSpaces = ` ${haystack} `;
    if (haystackWithSpaces.includes(tokenPattern)) {
      score += 3;
      matchCount++;
    } else if (haystack.includes(token)) {
      // Substring match (partial word or part of compound word)
      score += 1;
      matchCount++;
    }
  }

  // Bonus: chunks with more matching tokens get a multiplier
  // This encourages comprehensive matches over single-word matches
  if (matchCount > 1) {
    score += matchCount;
  }

  return score;
}

async function checkIndexExists() {
  return true;
}

async function createIndex() {
  logger.info('Using in-memory retrieval. No external vector index is required.');
}

async function hasStoredChunks(namespace) {
  return namespaceChunks.has(namespace) && namespaceChunks.get(namespace).length > 0;
}

async function describeIndexStats() {
  const namespaces = {};
  let totalRecordCount = 0;

  for (const [namespace, chunks] of namespaceChunks.entries()) {
    namespaces[namespace] = { recordCount: chunks.length };
    totalRecordCount += chunks.length;
  }

  return {
    namespaces,
    dimension: null,
    indexFullness: 0,
    totalRecordCount,
  };
}

async function storeEmbeddings(embeddingsDataArr, namespace) {
  try {
    if (!Array.isArray(embeddingsDataArr) || embeddingsDataArr.length === 0) {
      logger.warn('No embeddings to store (received empty array). Skipping upsert.');
      return;
    }

    const chunks = embeddingsDataArr
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item.chunk === 'string') {
          return item.chunk;
        }

        return '';
      })
      .filter(Boolean);

    namespaceChunks.set(namespace, chunks);
    logger.info('Chunks stored successfully (in-memory)');
  } catch (error) {
    logger.error({ err: error }, 'Error storing chunks');
  }
}

async function retrieveRelevantChunks(query, namespace) {
  try {
    const chunks = namespaceChunks.get(namespace) || [];
    if (!chunks.length) {
      return [];
    }

    const queryTokens = normalizeText(query)
      .split(' ')
      .filter(Boolean);

    const scored = chunks.map((chunk) => ({
      chunk,
      score: scoreChunk(queryTokens, chunk),
      length: chunk.length, // Prefer longer, more detailed chunks
    }));

    // Sort by: score (highest first), then by length (prefer longer chunks with context)
    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.length - a.length; // Tiebreaker: longer chunks are better
    });

    // HYBRID INTELLIGENCE: Return more chunks for better hybrid processing
    // The hybrid system will filter by relevance threshold
    const ranked = scored.slice(0, 20).map((item) => item.chunk);

    return ranked;
  } catch (error) {
    logger.error({ err: error }, 'Error retrieving relevant chunks');
    throw error;
  }
}

/**
 * Enhanced retrieval with similarity scores
 * Used by hybrid intelligence system for threshold-based filtering
 * @param {string} query - Search query
 * @param {string} namespace - Video namespace
 * @returns {Promise<Array>} Chunks with scores: { chunk, score }
 */
async function retrieveChunksWithScores(query, namespace) {
  try {
    const chunks = namespaceChunks.get(namespace) || [];
    if (!chunks.length) {
      return [];
    }

    const queryTokens = normalizeText(query)
      .split(' ')
      .filter(Boolean);

    const scored = chunks.map((chunk) => ({
      chunk,
      score: scoreChunk(queryTokens, chunk),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Return all scored chunks, hybrid system decides filtering
    return scored.slice(0, 25);
  } catch (error) {
    logger.error({ err: error }, 'Error retrieving chunks with scores');
    throw error;
  }
}

async function getAllChunks(namespace) {
    return namespaceChunks.get(namespace) || [];
  }

  export {
    storeEmbeddings,
    createIndex,
    describeIndexStats,
    retrieveRelevantChunks,
    retrieveChunksWithScores,
    checkIndexExists,
    hasStoredChunks,
    getAllChunks,
};

