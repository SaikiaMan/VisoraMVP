import logger from './logger.js';

const namespaceChunks = new Map();

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function scoreChunk(queryTokens, chunkContent) {
  const haystack = normalizeText(chunkContent);
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
        // Handle new chunk object format: { content, timestamp }
        if (item && typeof item === 'object' && item.content) {
          return {
            content: item.content,
            timestamp: item.timestamp || null
          };
        }

        // Handle old string format for backward compatibility
        if (typeof item === 'string') {
          return {
            content: item,
            timestamp: null
          };
        }

        // Handle legacy format: { chunk: string }
        if (item && typeof item.chunk === 'string') {
          return {
            content: item.chunk,
            timestamp: null
          };
        }

        return null;
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

    const scored = chunks.map((chunkObj) => ({
      ...chunkObj,
      score: scoreChunk(queryTokens, chunkObj.content),
      length: chunkObj.content.length,
    }));

    // Sort by: score (highest first), then by length (prefer longer chunks with context)
    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.length - a.length;
    });

    // HYBRID INTELLIGENCE: Return more chunks for better hybrid processing
    // The hybrid system will filter by relevance threshold
    // Return as strings for backward compatibility (content only)
    const ranked = scored.slice(0, 20).map((item) => item.content);

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

    const scored = chunks.map((chunkObj) => ({
      content: chunkObj.content,
      timestamp: chunkObj.timestamp,
      score: scoreChunk(queryTokens, chunkObj.content),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Return all scored chunks with metadata
    return scored.slice(0, 25);
  } catch (error) {
    logger.error({ err: error }, 'Error retrieving chunks with scores');
    throw error;
  }
}

/**
 * Detect timestamp in query and retrieve chunks near that timestamp
 * Handles queries like "what does the youtuber say at 20:20"
 * @param {string} query - User query
 * @param {string} namespace - Video namespace
 * @returns {Promise<Object>} { hasTimestamp, timestamp, chunks }
 */
async function retrieveChunksByTimestamp(query, namespace) {
  try {
    // Extract timestamp from query: [MM:SS] or [HH:MM:SS]
    const timestampMatch = query.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?|at\s+(\d{1,2}):(\d{2})|timestamp\s+(\d{1,2}):(\d{2})/i);
    
    if (!timestampMatch) {
      return { hasTimestamp: false, timestamp: null, chunks: [] };
    }

    const chunks = namespaceChunks.get(namespace) || [];
    if (!chunks.length) {
      return { hasTimestamp: true, timestamp: timestampMatch[0], chunks: [] };
    }

    // Find chunks with matching or nearby timestamps
    const chunksNearTimestamp = chunks
      .filter(chunkObj => chunkObj.timestamp !== null)
      .sort((a, b) => {
        // Prefer chunks with exact timestamp or nearby
        return a.timestamp === timestampMatch[0] ? -1 : 0;
      })
      .slice(0, 10);

    return {
      hasTimestamp: true,
      timestamp: timestampMatch[0],
      chunks: chunksNearTimestamp.map(c => c.content)
    };
  } catch (error) {
    logger.error({ err: error }, 'Error retrieving chunks by timestamp');
    return { hasTimestamp: false, timestamp: null, chunks: [] };
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
    retrieveChunksByTimestamp,
    checkIndexExists,
    hasStoredChunks,
    getAllChunks,
};

