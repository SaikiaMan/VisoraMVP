import logger from './logger.js';
import { processQueryWithHybridIntelligence, generateFallbackAnswer } from './hybrid-intelligence.js';

/**
 * Main answer generation function - now uses hybrid intelligence system
 * Maintains backward compatibility with existing API
 * 
 * HYBRID INTELLIGENCE PIPELINE:
 * 1. Filters chunks by similarity threshold
 * 2. Classifies query type (TRANSCRIPT | GENERAL | HYBRID)
 * 3. Routes to appropriate processing pipeline
 * 4. Returns natural language answer
 * 
 * @param {string} query - User's question
 * @param {Array<string>} retrievedChunks - Chunks from vector database
 * @returns {Promise<string>} Generated answer
 */
async function generateAnswer(query, retrievedChunks) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set. Please add it to your .env file before running the app.');
  }

  try {
    // Use hybrid intelligence pipeline
    const result = await processQueryWithHybridIntelligence(query, retrievedChunks || []);
    
    logger.info(
      {
        queryType: result.queryType,
        usedTranscript: result.usedTranscript,
        relevance: result.relevanceScore.toFixed(2),
      },
      'Answer generated via hybrid intelligence'
    );

    return result.answer;
  } catch (error) {
    logger.error({ err: error?.message }, 'Hybrid intelligence failed, using fallback');
    
    // Fallback mechanism: return helpful message
    try {
      const fallbackMessage = generateFallbackAnswer(query, 0.2);
      return fallbackMessage;
    } catch (fallbackError) {
      logger.error({ err: fallbackError?.message }, 'Fallback failed completely');
      return 'I encountered an error processing your question. Please try again with a different question.';
    }
  }
}

export { generateAnswer };