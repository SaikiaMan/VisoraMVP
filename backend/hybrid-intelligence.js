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
 * Detects if query is asking about a specific timestamp
 * Examples: "what at 20:20", "timestamp 5:30", "at 10:15:30"
 * @param {string} query - User query
 * @returns {Object} { isTimestampQuery: boolean, timestamp: string|null }
 */
function detectTimestampQuery(query) {
  // Match patterns like: "20:20", "5:30", "10:15:30", "at 20:20", "timestamp 5:30"
  const timestampMatch = query.match(
    /(?:at|timestamp|around|about|near)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/i
  );
  
  if (timestampMatch) {
    return {
      isTimestampQuery: true,
      timestamp: timestampMatch[0].trim()
    };
  }
  
  return {
    isTimestampQuery: false,
    timestamp: null
  };
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
      systemPrompt = `You are an advanced AI tutor embedded in a YouTube learning platform.

ANSWER STRUCTURE:
1. Start with DIRECT ANSWER (1–2 lines max)
2. If answer needs explanation:
   - Add blank line
   - Use bullet points with clear explanations
   - Each bullet = one idea
3. Keep language simple and clear
4. NO markdown formatting, NO ### headings

STYLE:
- Direct and to the point
- Use bullets for steps/explanations
- Clean white space between sections
- Avoid long paragraphs`;

      userPrompt = `You are answering from this video transcript:
${chunks.join(' ')}

Question: ${query}

Answer: Direct answer first, then bullet points if needed. No headings or markdown.`;
    } else if (queryType === 'GENERAL') {
      // LLM-only: General knowledge answer
      systemPrompt = `You are an advanced AI tutor embedded in a YouTube learning platform.

ANSWER STRUCTURE:
1. Start with DIRECT ANSWER (1–2 lines max)
2. If answer needs explanation:
   - Add blank line
   - Use bullet points with clear explanations
   - Each bullet = one idea
3. Keep language simple and clear
4. NO markdown formatting, NO ### headings

STYLE:
- Direct and to the point
- Use bullets for steps/explanations
- Clean white space between sections
- Avoid long paragraphs`;

      userPrompt = `Question: ${query}

Answer: Direct answer first, then bullet points if needed. No headings or markdown.`;
    } else {
      // HYBRID: Combine transcript + general knowledge
      systemPrompt = `You are an advanced AI tutor embedded in a YouTube learning platform.

ANSWER STRUCTURE:
1. Start with DIRECT ANSWER (1–2 lines max)
2. If answer needs explanation:
   - Add blank line
   - Use bullet points with clear explanations
   - Each bullet = one idea
3. Keep language simple and clear
4. NO markdown formatting, NO ### headings

RULES:
- Use transcript as foundation
- If incomplete, add your knowledge
- Synthesize and explain clearly
- Use bullets for multiple steps or points

STYLE:
- Direct and to the point
- Use bullets for steps/explanations
- Clean white space between sections
- Avoid long paragraphs`;

      const transcriptSection = chunks.length > 0 
        ? `Video transcript context:
${chunks.join(' ')}

` 
        : '';

      userPrompt = `${transcriptSection}Question: ${query}

Answer: Direct answer first, then bullet points if needed. No headings or markdown.`;
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
        content: `You are an editor. Your job: Format this answer cleanly and readably.

TARGET FORMAT:
1. If simple topic: 2-3 sentences directly, then blank line, then bullet points
2. If complex topic: Direct answer first (1-2 lines), then bullet points with sub-explanations
3. IMPORTANT: Clean separation between text and points
4. IMPORTANT: NO ### headings, NO markdown
5. Bullet format: "- Point: explanation"
6. Remove repetition

RULES:
- Bullet points should be SEPARATE from paragraphs (blank line before first bullet)
- Each bullet = one clear idea with explanation
- Simple language, no jargon
- If answer has multiple steps/parts, use bullets
- NO markdown headings or bold formatting

EXAMPLE OUTPUT:
"Machine learning trains computers to recognize patterns without explicit programming.

- Identify the problem: Define what you want the model to learn (e.g., image recognition)
- Collect data: Gather examples relevant to your task
- Choose algorithm: Select appropriate model (decision trees, neural networks, etc.)
- Train the model: Let it learn patterns from your data
- Test and evaluate: Check accuracy on new data
- Refine: Improve performance by adjusting parameters"

Now format this answer - keep direct statement first, then clean bullet points:`,
      },
      {
        role: 'user',
        content: `${rawAnswer}`,
      },
    ]);

    let finalAnswer = polishedAnswer || rawAnswer || 'Unable to generate answer.';

    // Sanitize and format - preserve markdown structure
    finalAnswer = finalAnswer
      .replace(/\[\s*(Video|Chunks|Transcript)[^\]]*\]/gi, '') // Remove metadata
      .replace(/\n\n+/g, '\n\n') // Normalize multiple line breaks to double
      .trim();

    // ── PASS 3: Only apply sentence breaks if NO structured format ──────
    // Check if answer already has bullets/numbers (structured format)
    const hasStructure = /\n\s*[-*•]\s|\n\s*\d+\.\s/m.test(finalAnswer);
    
    if (!hasStructure && finalAnswer.length > 200) {
      // No structure AND long answer - force break by sentences
      const sentences = finalAnswer.match(/[^.!?]+[.!?]+/g) || [finalAnswer];
      const formattedParagraphs = [];
      
      for (let i = 0; i < sentences.length; i += 2) {
        const para = sentences.slice(i, i + 2).join('').trim();
        if (para.length > 0) {
          formattedParagraphs.push(para);
        }
      }
      
      finalAnswer = formattedParagraphs.join('\n\n');
    }

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
    // Step 0: Detect timestamp queries
    const { isTimestampQuery, timestamp } = detectTimestampQuery(query);
    
    let chunksToUse = rawChunks;
    if (isTimestampQuery && rawChunks.length > 0) {
      // Prioritize chunks containing the timestamp
      const timestampRegex = new RegExp(timestamp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const chunksWithTimestamp = rawChunks.filter(chunk => timestampRegex.test(chunk));
      
      if (chunksWithTimestamp.length > 0) {
        // Put timestamp chunks first, then other relevant chunks
        chunksToUse = [...chunksWithTimestamp, ...rawChunks.filter(chunk => !chunksWithTimestamp.includes(chunk))];
        logger.info({ timestamp, matchingChunks: chunksWithTimestamp.length }, 'Timestamp detected - prioritizing matched chunks');
      }
    }

    // Step 1: Score and filter chunks
    const { relevantChunks, avgScore } = filterAndScoreChunks(chunksToUse, query);
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
      // For timestamp queries with no matching chunks, offer helpful context
      if (isTimestampQuery && relevantChunks.length === 0) {
        answer = `I couldn't find content at timestamp ${timestamp}. Please try another timestamp or ask a general question about the video topic.`;
      } else {
        answer = await generateHybridAnswer(query, [], 'GENERAL');
      }
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
    return `I couldn't find information about this in the video. Try asking about something else from the video, or I can help with general knowledge about this topic.`;
  }
  return `I found some related content in the video but couldn't form a complete answer. You might want to watch that part of the video for more details.`;
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
