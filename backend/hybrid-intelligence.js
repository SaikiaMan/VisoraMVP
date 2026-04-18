import logger from './logger.js';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Configuration constants
const SIMILARITY_THRESHOLD = 0.65; // Chunks below this score are considered irrelevant
const HYBRID_THRESHOLD = 0.50; // Medium relevance triggers hybrid mode
const MIN_CHUNK_LENGTH = 30; // Minimum meaningful chunk length

/**
 * Calls Groq API with given messages
 * @param {Array} messages - Chat messages array
 * @returns {Promise<string>} API response text
 */
async function callGroq(messages) {
  const resp = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model: GROQ_MODEL, messages }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(`Groq API error: ${JSON.stringify(data)}`);
  return data?.choices?.[0]?.message?.content?.trim() ?? '';
}

/**
 * Normalizes text for similarity comparison
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates similarity score between query and chunk
 * Uses token matching and contextual relevance
 * @param {string} query - User query
 * @param {string} chunk - Text chunk
 * @returns {number} Similarity score (0-1)
 */
function calculateSimilarityScore(query, chunk) {
  if (!chunk || chunk.length < MIN_CHUNK_LENGTH) return 0;

  const normalizedQuery = normalizeText(query);
  const normalizedChunk = normalizeText(chunk);

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const chunkWords = normalizedChunk.split(' ');

  if (queryTokens.length === 0 || chunkWords.length === 0) return 0;

  let matches = 0;
  let exactMatches = 0;

  // Check for token matches
  for (const token of queryTokens) {
    if (normalizedChunk.includes(` ${token} `) || normalizedChunk.startsWith(token) || normalizedChunk.endsWith(token)) {
      exactMatches++;
      matches += 2;
    } else if (normalizedChunk.includes(token)) {
      matches += 1;
    }
  }

  // Bonus for multiple matches
  if (matches > queryTokens.length) {
    matches += matches * 0.2;
  }

  // Normalize to 0-1 scale
  const maxScore = queryTokens.length * 2 + queryTokens.length * 0.2;
  const score = Math.min(matches / maxScore, 1.0);

  return score;
}

/**
 * Classifies query type to determine which pipeline to use
 * @param {string} query - User query
 * @param {Array<string>} chunks - Retrieved chunks
 * @param {number} avgSimilarity - Average similarity score
 * @returns {Promise<string>} Query type: "TRANSCRIPT" | "GENERAL" | "HYBRID"
 */
async function classifyQuery(query, chunks, avgSimilarity) {
  try {
    // Quick classification without API call if scores are clear
    if (avgSimilarity >= SIMILARITY_THRESHOLD) {
      return 'TRANSCRIPT';
    }
    if (avgSimilarity < HYBRID_THRESHOLD && (!chunks || chunks.length === 0)) {
      return 'GENERAL';
    }

    // Use LLM for nuanced classification
    const classificationPrompt = await callGroq([
      {
        role: 'system',
        content: `You are a query classifier for a YouTube learning AI copilot.

Classify the user's query into ONE of three categories:

1. TRANSCRIPT - Question is specifically about video content (e.g., "What does the instructor say about...", "Explain the concept from the video")
2. GENERAL - Question is general knowledge not tied to video (e.g., "What is machine learning?", "How does photosynthesis work?")
3. HYBRID - Question needs both video context and general knowledge (e.g., "How does this relate to...", "Can you explain using the video context?")

Return ONLY the category name, nothing else.`,
      },
      {
        role: 'user',
        content: `Query: "${query}"
Transcript relevance score: ${avgSimilarity.toFixed(2)}

Classify this query:`,
      },
    ]);

    const classification = classificationPrompt.trim().toUpperCase();
    if (['TRANSCRIPT', 'GENERAL', 'HYBRID'].includes(classification)) {
      return classification;
    }

    // Fallback based on similarity
    return avgSimilarity >= HYBRID_THRESHOLD ? 'HYBRID' : 'GENERAL';
  } catch (error) {
    logger.warn('Query classification failed, using similarity fallback', error);
    return avgSimilarity >= HYBRID_THRESHOLD ? 'HYBRID' : 'GENERAL';
  }
}

/**
 * Filters and scores chunks, returning only relevant ones
 * @param {Array<string>} chunks - Raw retrieved chunks
 * @param {string} query - User query
 * @returns {Object} { relevantChunks: Array, avgScore: number, maxScore: number }
 */
function filterAndScoreChunks(chunks, query) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return { relevantChunks: [], avgScore: 0, maxScore: 0 };
  }

  const scored = chunks
    .map(chunk => ({
      chunk,
      score: calculateSimilarityScore(query, chunk),
    }))
    .filter(item => item.score > 0) // Remove completely irrelevant chunks
    .sort((a, b) => b.score - a.score);

  const avgScore = scored.length > 0 ? scored.reduce((sum, item) => sum + item.score, 0) / scored.length : 0;
  const maxScore = scored.length > 0 ? scored[0].score : 0;

  // Keep chunks above threshold
  const relevantChunks = scored
    .filter(item => item.score >= SIMILARITY_THRESHOLD)
    .map(item => item.chunk);

  return { relevantChunks, avgScore, maxScore };
}

/**
 * Generates answer based on query type and context
 * Implements hybrid logic for intelligent routing
 * @param {string} query - User query
 * @param {Array<string>} chunks - Retrieved chunks
 * @param {string} queryType - Type: "TRANSCRIPT" | "GENERAL" | "HYBRID"
 * @returns {Promise<string>} Generated answer
 */
async function generateHybridAnswer(query, chunks, queryType) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set');
  }

  try {
    let systemPrompt = '';
    let userPrompt = '';

    if (queryType === 'TRANSCRIPT' && chunks.length > 0) {
      // RAG-focused: Answer must come from transcript
      systemPrompt = `You are a YouTube copilot answering from video transcripts.

Be direct: Answer the question using the transcript. Be concise (2-3 sentences if possible).
- Only use information from the transcript
- Never make up or assume information
- If the transcript doesn't cover it, say so briefly`;

      userPrompt = `Transcript: ${chunks.join(' ')}

Question: ${query}

Answer:`;
    } else if (queryType === 'GENERAL') {
      // LLM-only: General knowledge answer
      systemPrompt = `You are a helpful tutor. Answer the question clearly and concisely.
- Be direct and avoid hedging language
- Skip unnecessary elaboration
- Use simple explanations
- Be confident in your answer`;

      userPrompt = `Question: ${query}

Answer:`;
    } else {
      // HYBRID: Combine transcript + general knowledge
      systemPrompt = `You are a YouTube copilot. Answer using the transcript AND your knowledge.

Be concise:
- Share relevant transcript info first
- Fill gaps with general knowledge
- Connect them naturally
- Keep it brief`;

      const transcriptSection = chunks.length > 0 
        ? `Transcript excerpt: ${chunks.join(' ')}

` 
        : '';

      userPrompt = `${transcriptSection}Question: ${query}

Answer:`;
    }

    // ── PASS 1: Generate raw answer ────────────────────────────────────
    const rawAnswer = await callGroq([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // ── PASS 2: Polish for ChatGPT-style output ────────────────────────
    const polishedAnswer = await callGroq([
      {
        role: 'system',
        content: `You are a world-class editor. Your job: Transform this answer into ChatGPT style - natural, concise, confident.

REQUIREMENTS:
- Remove ALL hedging language: "it seems", "might be", "appears to be", "possibly", "perhaps", "it's difficult to", "without further context"
- Remove repetition: Don't say the same thing twice in different ways
- Be direct and confident: Choose a clear interpretation, don't list multiple possibilities
- NO markdown: NO headings, NO bold, NO bullet points, NO asterisks, NO numbered lists
- Keep it SHORT: 2-4 sentences max unless complex topic
- Natural flow: Conversational, not academic
- No unnecessary elaboration: Get to the point

EXAMPLE INPUT:
"It seems to be a course, and it might be focused on AI. It appears to be related to learning about AI. However, without further context, it's difficult to provide a precise answer. It's possible that Gen AI is a program, but more details would be needed."

EXAMPLE OUTPUT:
"Gen AI appears to be a course or program focused on teaching AI and Python. Based on the mention of a completed cohort, it's likely a structured learning initiative."

Now transform the given answer:`,
      },
      {
        role: 'user',
        content: `${rawAnswer}`,
      },
    ]);

    let finalAnswer = polishedAnswer || rawAnswer || 'Unable to generate answer.';

    // Sanitize
    finalAnswer = finalAnswer
      .replace(/\[\s*(Video|Chunks|Transcript)[^\]]*\]/gi, '')
      .replace(/#+\s*/g, '') // Remove any markdown headings
      .replace(/\n\s*[-*•]\s+/g, '\n') // Remove bullet points
      .replace(/\n\s*\d+\.\s+/g, '\n') // Remove numbered lists
      .replace(/\*\*/g, '') // Remove bold markers
      .trim();

    return finalAnswer;
  } catch (error) {
    logger.error('Hybrid answer generation failed:', error?.message);
    throw error;
  }
}

/**
 * Main hybrid intelligence pipeline
 * Routes query through appropriate processing path
 * @param {string} query - User query
 * @param {Array<string>} rawChunks - Retrieved chunks from vector DB
 * @returns {Promise<Object>} { answer: string, queryType: string, usedTranscript: boolean }
 */
async function processQueryWithHybridIntelligence(query, rawChunks) {
  try {
    // Step 1: Score and filter chunks
    const { relevantChunks, avgScore } = filterAndScoreChunks(rawChunks, query);
    logger.info({ queryType: 'HYBRID', relevance: avgScore.toFixed(2) }, 'Chunk relevance calculated');

    // Step 2: Classify query type
    const queryType = await classifyQuery(query, relevantChunks, avgScore);
    logger.info({ queryType }, 'Query classified');

    // Step 3: Route to appropriate pipeline
    let answer = '';
    let usedTranscript = false;

    if (queryType === 'TRANSCRIPT' && relevantChunks.length > 0) {
      // Pure transcript-based answer
      answer = await generateHybridAnswer(query, relevantChunks, 'TRANSCRIPT');
      usedTranscript = true;
    } else if (queryType === 'GENERAL' || relevantChunks.length === 0) {
      // General knowledge answer (no transcript needed)
      answer = await generateHybridAnswer(query, [], 'GENERAL');
      usedTranscript = false;
    } else {
      // HYBRID: Use both transcript and general knowledge
      answer = await generateHybridAnswer(query, relevantChunks, 'HYBRID');
      usedTranscript = relevantChunks.length > 0;
    }

    return {
      answer,
      queryType,
      usedTranscript,
      relevanceScore: avgScore,
    };
  } catch (error) {
    logger.error('Hybrid intelligence processing failed:', error?.message);
    throw error;
  }
}

/**
 * Fallback handler for edge cases
 * Returns a generic helpful message when all else fails
 * @param {string} query - Original query
 * @param {number} relevanceScore - Relevance score
 * @returns {string} Fallback message
 */
function generateFallbackAnswer(query, relevanceScore) {
  if (relevanceScore < 0.3) {
    return `I'm having trouble connecting your question to the video content. Could you try rephrasing it? Or I can help with general knowledge about similar topics if that would be useful.`;
  }
  return `I found some related content but couldn't form a complete answer. The video discusses related topics - you might want to review that section of the video for more details.`;
}

export {
  processQueryWithHybridIntelligence,
  generateFallbackAnswer,
  classifyQuery,
  filterAndScoreChunks,
  calculateSimilarityScore,
  SIMILARITY_THRESHOLD,
  HYBRID_THRESHOLD,
};
