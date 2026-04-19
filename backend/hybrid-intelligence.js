import logger from './logger.js';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Configuration constants
const SIMILARITY_THRESHOLD = 0.65; // Chunks below this score are considered irrelevant
const HYBRID_THRESHOLD = 0.50; // Medium relevance triggers hybrid mode
const MIN_CHUNK_LENGTH = 30; // Minimum meaningful chunk length

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED VIDEO KNOWLEDGE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * STRUCTURED VIDEO KNOWLEDGE BASE
 * Stores rich semantic understanding of video content
 * @typedef {Object} VideoKnowledge
 * @property {Array<Topic>} topics - Main topics covered
 * @property {Array<Concept>} concepts - Key concepts and definitions
 * @property {Array<Relationship>} relationships - Concept relationships
 * @property {Array<Example>} examples - Real-world examples
 * @property {Array<String>} steps - Process steps (if tutorial)
 * @property {String} videoTopic - Primary topic of video
 * @property {String} difficultyLevel - Beginner/Intermediate/Advanced
 */

/**
 * PROCESSOR: Extract structure from transcript chunks
 * Builds a semantic understanding of video content
 * @param {Array<String>} chunks - Raw transcript chunks with timestamps
 * @returns {Promise<VideoKnowledge>} Structured knowledge base
 */
async function processTranscript(chunks) {
  if (!chunks || chunks.length === 0) {
    return createEmptyKnowledge();
  }

  const fullTranscript = chunks.join(' ');
  
  try {
    // Use LLM to extract structure
    const extraction = await callGroq([
      {
        role: 'system',
        content: `You are a video content analyzer. Extract structured knowledge from a transcript.

Return ONLY valid JSON (no markdown, no code blocks):
{
  "topics": ["topic1", "topic2"],
  "mainConcepts": [{"name": "concept", "definition": "short def"}],
  "teachingSteps": ["step1", "step2"],
  "relationships": [{"from": "concept1", "to": "concept2", "relation": "concept2 uses concept1"}],
  "examples": [{"concept": "concept_name", "example": "specific example from transcript"}],
  "videoTitle": "inferred title",
  "difficultyLevel": "Beginner|Intermediate|Advanced"
}`,
      },
      {
        role: 'user',
        content: `Extract structured knowledge:\n\n${fullTranscript.substring(0, 3000)}...`,
      },
    ]);

    const parsed = JSON.parse(extraction);
    return {
      topics: parsed.topics || [],
      concepts: parsed.mainConcepts || [],
      relationships: parsed.relationships || [],
      examples: parsed.examples || [],
      steps: parsed.teachingSteps || [],
      videoTopic: parsed.videoTitle || 'Unknown Topic',
      difficultyLevel: parsed.difficultyLevel || 'Intermediate',
      _raw: chunks, // Keep raw chunks for fallback
    };
  } catch (error) {
    logger.warn('Transcript structure extraction failed, using fallback:', error?.message);
    return createEmptyKnowledge(chunks);
  }
}

/**
 * Creates empty knowledge structure with raw chunks as fallback
 * Tries to infer the main topic from chunks when LLM is unavailable
 * @param {Array<String>} chunks - Raw chunks
 * @returns {VideoKnowledge}
 */
/**
 * Creates empty knowledge structure with raw chunks as fallback
 * @param {Array<String>} chunks - Raw chunks
 * @returns {VideoKnowledge}
 */
function createEmptyKnowledge(chunks = []) {
  return {
    topics: [],
    concepts: [],
    relationships: [],
    examples: [],
    steps: [],
    videoTopic: 'Unknown',
    difficultyLevel: 'Intermediate',
    _raw: chunks,
  };
}

/**
 * DETECTOR: Find relevant concepts in knowledge base for a query
 * Uses keyword matching + semantic similarity + main topic detection
 * @param {String} query - User question
 * @param {VideoKnowledge} knowledge - Video knowledge base
 * @returns {Object} { concepts, topics, confidence, isMainTopic }
 */
function detectRelevantConcepts(query, knowledge) {
  const queryLower = query.toLowerCase();
  const relevantConcepts = [];
  const relevantTopics = [];
  
  // CHECK MAIN VIDEO TOPIC FIRST - this is critical!
  const videoTopicLower = (knowledge.videoTopic || '').toLowerCase();
  let isMainTopic = false;
  
  if (videoTopicLower) {
    // Split topic by spaces and check if ANY word from topic is in query
    const topicWords = videoTopicLower.split(/\s+/).filter(Boolean);
    const matchingWords = topicWords.filter(word => queryLower.includes(word));
    
    // If main topic words appear in query, this is likely a main topic question
    if (matchingWords.length > 0) {
      isMainTopic = true;
      relevantTopics.push(knowledge.videoTopic);
    }
  }

  // Keyword matching against concepts
  if (knowledge.concepts && knowledge.concepts.length > 0) {
    knowledge.concepts.forEach(concept => {
      const conceptName = concept.name?.toLowerCase() || '';
      const definition = concept.definition?.toLowerCase() || '';
      const keywords = `${conceptName} ${definition}`.split(/\s+/).filter(Boolean);

      const matchScore = keywords.filter(kw => queryLower.includes(kw)).length;
      if (matchScore > 0) {
        relevantConcepts.push({
          ...concept,
          matchScore,
        });
      }
    });
  }

  // Topic matching
  if (knowledge.topics && knowledge.topics.length > 0) {
    knowledge.topics.forEach(topic => {
      if (queryLower.includes(topic.toLowerCase()) && !relevantTopics.includes(topic)) {
        relevantTopics.push(topic);
      }
    });
  }

  // Sort by relevance
  relevantConcepts.sort((a, b) => b.matchScore - a.matchScore);

  return {
    concepts: relevantConcepts.slice(0, 5), // Top 5 matching concepts
    topics: relevantTopics,
    hasDirect: relevantConcepts.length > 0 || isMainTopic, // FIXED: include main topic
    isMainTopic, // NEW: flag for main topic queries
    confidence: isMainTopic 
      ? 0.95 // High confidence if main topic
      : (relevantConcepts.length > 0 ? Math.min(1, relevantConcepts[0].matchScore / 3) : 0),
  };
}

/**
 * RETRIEVER: Get all data related to a concept
 * @param {String} concept - Concept name
 * @param {VideoKnowledge} knowledge - Knowledge base
 * @returns {Object} { definition, examples, relatedConcepts, steps }
 */
function retrieveConceptData(concept, knowledge) {
  const conceptLower = concept.toLowerCase();

  // Find concept definition
  const conceptDef = knowledge.concepts?.find(c => 
    c.name?.toLowerCase().includes(conceptLower)
  );

  // Find examples
  const examples = knowledge.examples?.filter(e => 
    e.concept?.toLowerCase().includes(conceptLower)
  ) || [];

  // Find related concepts
  const relatedConcepts = knowledge.relationships?.filter(r =>
    r.from?.toLowerCase().includes(conceptLower) ||
    r.to?.toLowerCase().includes(conceptLower)
  ) || [];

  // Find teaching steps if concept is part of process
  const relevantSteps = knowledge.steps?.filter(s =>
    s.toLowerCase().includes(conceptLower)
  ) || [];

  return {
    definition: conceptDef?.definition || null,
    examples,
    relatedConcepts,
    steps: relevantSteps,
  };
}

/**
 * RETRIEVER: Get raw chunks matching a query (fallback to RAG)
 * @param {String} query - User query
 * @param {VideoKnowledge} knowledge - Knowledge base
 * @returns {Array<String>} Matching chunks
 */
function retrieveFallbackChunks(query, knowledge) {
  if (!knowledge._raw || knowledge._raw.length === 0) {
    return [];
  }

  const queryTokens = query.toLowerCase().split(/\s+/);
  const scored = knowledge._raw.map(chunk => ({
    chunk,
    score: queryTokens.filter(token => chunk.toLowerCase().includes(token)).length,
  }));

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => s.chunk);
}

/**
 * ANSWER GENERATOR: Create deep, context-aware answers
 * @param {String} query - User question
 * @param {Object} retrieval - Retrieved concepts/data
 * @param {VideoKnowledge} knowledge - Knowledge base
 * @returns {Promise<String>} Generated answer
 */
async function generateDeepAnswer(query, retrieval, knowledge) {
  const { concepts, topics, hasDirect, isMainTopic } = retrieval;

  // Build context from concept data
  let contextData = '';
  if (concepts && concepts.length > 0) {
    contextData = concepts.map(c => {
      const data = retrieveConceptData(c.name, knowledge);
      return `
CONCEPT: ${c.name}
Definition: ${data.definition || 'N/A'}
Examples: ${data.examples?.map(e => e.example).join('; ') || 'N/A'}
Related: ${data.relatedConcepts?.map(r => r.to).join(', ') || 'N/A'}`;
    }).join('\n---\n');
  }

  // SPECIAL HANDLING FOR MAIN TOPIC QUERIES
  if (isMainTopic && knowledge._raw && knowledge._raw.length > 0) {
    // Use raw chunks to answer about main topic
    const rawContext = knowledge._raw.slice(0, 8).join('\n\n');
    
    return callGroq([
      {
        role: 'system',
        content: `You are an expert tutor explaining the main topic of a video.

VIDEO TOPIC: ${knowledge.videoTopic}
DIFFICULTY: ${knowledge.difficultyLevel}

Your task: Explain this topic clearly using the video content.

ANSWER RULES:
1. Explain the topic comprehensively
2. Use specific details from the video
3. Show why it's important
4. Provide practical context
5. Be appropriate for ${knowledge.difficultyLevel} level

FORMAT:
- Start with direct explanation (2-3 sentences)
- Then bullet points with key aspects
- Include examples from the video`,
      },
      {
        role: 'user',
        content: `VIDEO TRANSCRIPT:
${rawContext}

QUESTION: ${query}

Explain this topic using the video content. Be specific and comprehensive.`,
      },
    ]);
  }

  const systemPrompt = hasDirect
    ? `You are an expert tutor explaining concepts from a video.

ROLE: Teach clearly by connecting concepts and providing examples.

VIDEO CONTEXT: Video covers "${knowledge.videoTopic}"
Difficulty: ${knowledge.difficultyLevel}

ANSWER RULES:
1. Explain like a teacher (step-by-step if needed)
2. Use the provided concept data as foundation
3. Connect related concepts
4. Include examples where relevant
5. If concept not fully explained in video, expand with knowledge BUT link back to video content
6. Keep language appropriate for ${knowledge.difficultyLevel} level

FORMAT:
- Direct answer first (1-2 sentences)
- Explanations in bullet points
- Examples if available
- Links to related concepts`
    : `You are a helpful tutor about "${knowledge.videoTopic}".

The user asked something not directly in the video content.
However, relate your answer to the video's main topic and difficulty level.

Difficulty: ${knowledge.difficultyLevel}

Answer naturally but keep it relevant to the video subject.`;

  const userPrompt = hasDirect
    ? `CONCEPT DATA:
${contextData}

QUESTION: ${query}

Answer using the concept data. Teach clearly.`
    : `QUESTION: ${query}

CONTEXT: Video is about "${knowledge.videoTopic}"

Answer the question relating it to this video's topic.`;

  return callGroq([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
}

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
 * Detects if query is asking for overview/summary of video
 * Examples: "what is video about", "summary", "overview", "main topics"
 * @param {string} query - User query
 * @returns {boolean} True if overview question
 */
function isOverviewQuestion(query) {
  const overviewPatterns = [
    /what\s+(?:is|are)\s+(?:the\s+)?video(?:\s+about)?/i,
    /tell\s+me\s+about\s+(?:the\s+)?video/i,
    /summary|overview|main\s+topic|what\s+.*\s+cover/i,
    /explain\s+(?:the\s+)?video/i,
    /describe\s+(?:the\s+)?video/i
  ];
  
  return overviewPatterns.some(pattern => pattern.test(query));
}

/**
 * Detects if an answer is generic/hallucinated (not specific to video content)
 * Examples of generic: "covers basics", "specific topic", "related to learning"
 * @param {string} answer - Generated answer
 * @returns {boolean} True if answer appears generic/hallucinated
 */
function isGenericAnswer(answer) {
  const genericPatterns = [
    /\ba\s+specific\s+topic\b/i,
    /\bmay\s+cover\b/i,
    /\bcould\s+be\s+about\b/i,
    /\brelated\s+to\s+\w+\b/i,
    /\bappears\s+to\s+\w+\b/i,
    /\bseems\s+to\s+\w+\b/i,
    /\bpotentially\b/i,
    /\bpossibly\b/i,
    /\bmight\s+\w+\b/i,
    /\bcould\s+\w+\b/i,
    /\bcomprehensive\s+\w+/i,
    /\bprovides\s+a\s+\w+\s+(?:tutorial|guide|overview)/i,
    /\bcovers\s+(?:basics|fundamentals|essentials)/i,
    /\bstep-by-step\s+process/i,
    /\btips\s+and\s+tricks/i,
    /\breal-world\s+application/i,
    /\bengage\s+the\s+audience/i,
    /\bpromote\s+learning/i,
    /\beducational\s+approach/i,
    /\binteractive\s+elements/i,
  ];
  
  // Check how many generic patterns match
  const matchCount = genericPatterns.filter(pattern => pattern.test(answer)).length;
  
  // If multiple generic patterns or answer is very vague, it's probably hallucinated
  return matchCount >= 2 || /^(the\s+)?(video|this|it)\s+\w+\s+about\s+\w+\s+topics?/i.test(answer);
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
    const isOverview = isOverviewQuestion(query);

    if (queryType === 'TIMESTAMP_CONTEXT') {
      // STRICT: Timestamp context - extract ONLY from chunks, no hallucination
      systemPrompt = `You are extracting information from a video transcript at a specific timestamp.

YOUR TASK: Identify and explain what topic/subject the speaker is discussing at this point in the video.

CRITICAL RULES:
1. Extract ONLY information that appears in the provided transcript
2. Identify the MAIN TOPIC or subject being discussed - be specific about what it is
3. Explain what the speaker is talking about in clear, simple terms
4. Use actual words/phrases from the transcript
5. Do NOT invent, assume, or fill in missing details with general knowledge
6. Do NOT generate plausible-sounding but unverified content

ANSWER FORMAT:
- Start with: "At this timestamp, the speaker is discussing..." or "The topic at this timestamp is..."
- State the specific topic name or subject clearly
- Briefly explain what about it is being discussed
- Include relevant details from the transcript

If the transcript is too sparse to extract meaningful topic:
- Still try to identify ANY keyword or topic name mentioned
- Provide whatever context is available
- Say "The content at this point is brief" if needed

NO SPECULATION, NO GENERAL KNOWLEDGE - ONLY TRANSCRIPT CONTENT.`;

      userPrompt = `Transcript content near requested timestamp:
${chunks.join('\n---\n')}

Question: ${query}

EXTRACT: What topic/subject is the speaker discussing? State the topic clearly and explain it using only the transcript. Even if brief, identify the topic name or subject matter.`;
    } else if (queryType === 'TRANSCRIPT' && chunks.length > 0) {
      if (isOverview) {
        // Special handling for overview/summary questions
        systemPrompt = `You are an AI analyst tasked with summarizing a YouTube video based on its transcript.

YOUR JOB: Analyze THIS specific video and extract REAL information from it.

DO NOT generate generic statements like "covers basics", "step-by-step", "tips and tricks", "real-world application".

INSTEAD:
1. NAME THE ACTUAL TOPIC: What is this video really about? Be specific.
2. EXTRACT SPECIFIC CONTENT: What exact concepts, tools, or procedures are discussed?
3. IDENTIFY KEY POINTS: What are the main ideas presented?
4. NOTE THE APPROACH: How is the content delivered?
5. STATE THE OUTCOME: What will someone learn or be able to do after watching?

FORMAT:
- Start with 1-2 sentences describing what the video IS
- Then list 3-4 actual topics/concepts covered (not generic categories)
- Then briefly explain the teaching style
- End with practical outcome

CRITICAL: Use specific details from the transcript. No generic educational templates.`;

        userPrompt = `Analyze this video transcript and provide a specific summary:

${chunks.join(' ')}

Summary (be specific, extract real content, no generic templates):`;
      } else {
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
      }
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
    // Check if this is a "not clear" response - if so, skip polish and return as-is
    let polishedAnswer;
    if (rawAnswer.toLowerCase().includes('not clear') || rawAnswer.toLowerCase().includes('not found')) {
      // Don't polish "not clear" messages - keep them simple and direct
      polishedAnswer = rawAnswer;
    } else {
      polishedAnswer = await callGroq([
        {
          role: 'system',
          content: `You are an editor. Your job: Format this answer cleanly and readably.

CRITICAL FOR TIMESTAMP QUERIES: If the original answer says "not clear" or "not found", PRESERVE that message. Do NOT replace with general knowledge.

CRITICAL FOR SUMMARIES: If this is a video summary, DO NOT replace specific details with generic statements.
- REJECT: "covers basics", "step-by-step process", "tips and tricks", "real-world application"
- KEEP: Actual topics, specific concepts, real content from the video

FORMATTING RULES:
1. If simple topic: 2-3 sentences directly, then blank line, then bullet points
2. If complex topic: Direct statement first (1-2 lines), then bullet points with explanations
3. Clean separation between text and points (blank line before bullets)
4. Bullet format: "- Point: explanation"
5. NO markdown headings, NO ### symbols

RULES:
- Each bullet = one specific idea/topic
- Simple language, no jargon
- Remove repetition
- Preserve specific details (don't generalize)
- NO generic educational templates
- Preserve "not clear" messages

EXAMPLE (GOOD):
"This Python tutorial teaches web scraping using BeautifulSoup.

- BeautifulSoup library: Parse HTML and extract data
- Requests module: Fetch web pages
- Data extraction patterns: Navigate DOM trees and select elements
- Real example: Scrape product listings from an e-commerce site"

EXAMPLE (BAD):
"This video provides comprehensive tutorial on a topic, covering fundamentals and necessary tools.

- Covers the basics: Essential concepts and tools
- Step-by-step process: Manageable steps
- Tips and tricks: Expert advice
- Real-world application: Apply knowledge"

Now format - keep specific details, preserve "not clear" messages, remove generic language:`,
        },
        {
          role: 'user',
          content: `${rawAnswer}`,
        },
      ]);
    }

    let finalAnswer = polishedAnswer || rawAnswer || 'Unable to generate answer.';

    // Sanitize and format - preserve markdown structure
    finalAnswer = finalAnswer
      .replace(/\[\s*(Video|Chunks|Transcript)[^\]]*\]/gi, '') // Remove metadata
      .replace(/\n\n+/g, '\n\n') // Normalize multiple line breaks to double
      .trim();

    // ── ANTI-HALLUCINATION CHECK FOR OVERVIEW QUESTIONS ─────────────────
    // If this is an overview question and answer is generic, reject it
    if (isOverview && isGenericAnswer(finalAnswer) && chunks.length > 0) {
      // Answer is generic despite having chunks - LLM hallucinated
      // Ask LLM to extract REAL content from chunks
      const reattempt = await callGroq([
        {
          role: 'system',
          content: `CRITICAL: Your previous answer was too generic. You have a video transcript to analyze.

Your task: Extract REAL, SPECIFIC information about what THIS video actually teaches.

Rules:
1. Name the actual topic being taught
2. List specific concepts, tools, or skills covered
3. Describe the teaching method
4. State what viewers will learn

Use ONLY the provided transcript. Do NOT generate plausible-sounding but vague content.

If you cannot extract specific information, start with: "I couldn't find clear information about..."`,
        },
        {
          role: 'user',
          content: `Transcript:
${chunks.slice(0, 10).join(' ')}

Extract the real, specific topic and content. No generic educational templates.`,
        },
      ]);
      
      // If the reattempt is also generic, return "not clear"
      if (!isGenericAnswer(reattempt)) {
        finalAnswer = reattempt;
      } else {
        finalAnswer = `I couldn't find clear information about what this video covers. The transcript content isn't specific enough for me to provide a detailed summary. Try asking about a specific part of the video instead.`;
      }
    }

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
    // Step 0: Detect special query types
    const { isTimestampQuery, timestamp } = detectTimestampQuery(query);
    const isOverview = isOverviewQuestion(query);
    
    let chunksToUse = rawChunks;
    if (isTimestampQuery && rawChunks.length > 0) {
      // Extract target timestamp in seconds
      const timestampMatch = timestamp.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (timestampMatch) {
        const targetMinutes = parseInt(timestampMatch[1]);
        const targetSeconds = parseInt(timestampMatch[2]);
        const targetTotal = targetMinutes * 60 + targetSeconds;
        
        // Try exact match first
        const timestampRegex = new RegExp(timestamp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const chunksWithTimestamp = rawChunks.filter(chunk => timestampRegex.test(chunk));
        
        if (chunksWithTimestamp.length > 0) {
          // Exact match found - prioritize these
          chunksToUse = [...chunksWithTimestamp, ...rawChunks.filter(chunk => !chunksWithTimestamp.includes(chunk))];
          logger.info({ timestamp, matchingChunks: chunksWithTimestamp.length }, 'Timestamp detected - exact match found');
        } else {
          // No exact match - search for nearby timestamps (within ±5 minutes for more context)
          const nearbyChunks = rawChunks.filter(chunk => {
            const chunkTimeMatch = chunk.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/);
            if (chunkTimeMatch) {
              const chunkMinutes = parseInt(chunkTimeMatch[1]);
              const chunkSeconds = parseInt(chunkTimeMatch[2]);
              const chunkTotal = chunkMinutes * 60 + chunkSeconds;
              const timeDiff = Math.abs(chunkTotal - targetTotal);
              return timeDiff <= 300; // Within 5 minutes (expanded from 2)
            }
            return false;
          });
          
          if (nearbyChunks.length > 0) {
            // Found nearby content - use that, plus some context chunks for better extraction
            const contextChunks = rawChunks
              .map((chunk, idx) => ({ chunk, idx }))
              .filter(item => {
                // Include nearby chunks AND chunks that might be semantically relevant
                const isNearby = nearbyChunks.includes(item.chunk);
                const relevance = calculateSimilarityScore(query, item.chunk);
                return isNearby || relevance > 0.3;
              })
              .slice(0, 15) // Get up to 15 chunks for context
              .map(item => item.chunk);
            
            chunksToUse = contextChunks.length > 0 ? contextChunks : nearbyChunks;
            logger.info({ timestamp, nearbyChunks: nearbyChunks.length, contextChunks: chunksToUse.length }, 'No exact match - using nearby timestamps with context');
          } else {
            // Still no match - include all chunks as context
            logger.info({ timestamp }, 'Timestamp beyond content range - using full context');
          }
        }
      }
    }

    // Step 1: Score and filter chunks
    // For overview questions, use ALL chunks (don't filter by threshold)
    const { relevantChunks, avgScore } = isOverview 
      ? { relevantChunks: chunksToUse, avgScore: 0.8 }
      : filterAndScoreChunks(chunksToUse, query);
    
    logger.info({ queryType: 'HYBRID', relevance: avgScore.toFixed(2), isOverview }, 'Chunk relevance calculated');

    // Step 2: Classify query type
    const queryType = isOverview ? 'TRANSCRIPT' : await classifyQuery(query, relevantChunks, avgScore);
    logger.info({ queryType }, 'Query classified');

    // Step 3: Route to appropriate pipeline
    let answer = '';
    let usedTranscript = false;
    
    // Determine actual pipeline to use
    let actualPipeline = queryType;
    if (isTimestampQuery && avgScore < 0.5) {
      // For timestamp queries with low relevance, use strict TIMESTAMP_CONTEXT mode
      actualPipeline = 'TIMESTAMP_CONTEXT';
    }

    if ((actualPipeline === 'TRANSCRIPT' && relevantChunks.length > 0) || isOverview) {
      // Pure transcript-based answer
      answer = await generateHybridAnswer(query, relevantChunks, 'TRANSCRIPT');
      usedTranscript = true;
    } else if (actualPipeline === 'TIMESTAMP_CONTEXT') {
      // Strict timestamp extraction - no hallucination
      answer = await generateHybridAnswer(query, relevantChunks, 'TIMESTAMP_CONTEXT');
      usedTranscript = true;
    } else if (actualPipeline === 'GENERAL' || relevantChunks.length === 0) {
      // Check if this is a timestamp query with no content found
      if (isTimestampQuery && relevantChunks.length === 0) {
        // Timestamp exists but no matching chunks nearby
        const maxTimestamp = extractMaxTimestamp(chunksToUse);
        const targetMinutes = parseInt(timestamp.split(':')[0]);
        const targetSeconds = parseInt(timestamp.split(':')[1]);
        const targetTotal = targetMinutes * 60 + targetSeconds;
        
        if (maxTimestamp > 0 && targetTotal > maxTimestamp) {
          // Timestamp is beyond video length
          const mins = parseInt(timestamp.split(':')[0]);
          const secs = parseInt(timestamp.split(':')[1]);
          answer = `That timestamp (${mins}:${secs < 10 ? '0' : ''}${secs}) appears to be beyond the video content. The video seems to end around ${formatTime(maxTimestamp)}. Would you like to ask about a different timestamp or get a general summary?`;
        } else if (chunksToUse.length > 0) {
          // Timestamp is within range but no clear content found - use minimal context
          // Get just 3-5 chunks around the timestamp for extraction
          answer = await generateHybridAnswer(query, chunksToUse.slice(0, 5), 'TIMESTAMP_CONTEXT');
        } else {
          // No context at all
          answer = `I couldn't find clear information at that timestamp. Try asking about a different time or get a general question answered.`;
        }
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

/**
 * Extracts the maximum timestamp from chunks to determine video length
 * @param {Array<string>} chunks - Raw chunks
 * @returns {number} Maximum timestamp in seconds, or 0 if no timestamps found
 */
function extractMaxTimestamp(chunks) {
  let maxSeconds = 0;
  
  for (const chunk of chunks) {
    const matches = chunk.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g);
    if (matches) {
      for (const match of matches) {
        const timeMatch = match.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/);
        if (timeMatch) {
          const minutes = parseInt(timeMatch[1]);
          const seconds = parseInt(timeMatch[2]);
          const totalSeconds = minutes * 60 + seconds;
          if (totalSeconds > maxSeconds) {
            maxSeconds = totalSeconds;
          }
        }
      }
    }
  }
  
  return maxSeconds;
}

/**
 * Formats seconds into MM:SS format
 * @param {number} totalSeconds - Total seconds
 * @returns {string} Formatted time string
 */
function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED SYSTEM INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

// Cache video knowledge bases to avoid reprocessing
const videoKnowledgeCache = new Map();

/**
 * INTEGRATION: Build or retrieve video knowledge base
 * @param {Array<String>} chunks - Raw transcript chunks
 * @param {String} cacheKey - Unique identifier (namespace/videoUrl)
 * @returns {Promise<VideoKnowledge>} Video knowledge structure
 */
async function buildVideoKnowledge(chunks, cacheKey) {
  // Check cache first
  if (videoKnowledgeCache.has(cacheKey)) {
    logger.info({ cacheKey }, 'Retrieved video knowledge from cache');
    return videoKnowledgeCache.get(cacheKey);
  }

  // Build new knowledge structure
  logger.info({ cacheKey, chunkCount: chunks.length }, 'Building video knowledge base');
  const knowledge = await processTranscript(chunks);

  // Cache for reuse
  videoKnowledgeCache.set(cacheKey, knowledge);
  
  logger.info({
    cacheKey,
    topics: knowledge.topics.length,
    concepts: knowledge.concepts.length,
  }, 'Video knowledge built and cached');

  return knowledge;
}

/**
 * INTEGRATION: Advanced query answering using structured knowledge
 * Combines new knowledge system with existing hybrid intelligence
 * @param {String} query - User query
 * @param {Array<String>} chunks - Raw transcript chunks
 * @param {String} cacheKey - Cache identifier
 * @returns {Promise<Object>} { answer, answerType, confidence }
 */
async function answerWithAdvancedKnowledge(query, chunks, cacheKey) {
  try {
    // Build knowledge base (with fallback to inferred topic if LLM fails)
    const knowledge = await buildVideoKnowledge(chunks, cacheKey);
    
    logger.info({
      cacheKey,
      videoTopic: knowledge.videoTopic,
      conceptsCount: knowledge.concepts.length,
    }, 'Knowledge base ready');

    // Detect relevant concepts
    const retrieval = detectRelevantConcepts(query, knowledge);

    logger.info({
      query,
      conceptsFound: retrieval.concepts.length,
      isMainTopic: retrieval.isMainTopic,
      confidence: retrieval.confidence.toFixed(2),
    }, 'Concept detection completed');

    // Generate answer using advanced system
    if (retrieval.hasDirect || retrieval.isMainTopic) {
      // Use concept-based or main-topic answering
      try {
        const answer = await generateDeepAnswer(query, retrieval, knowledge);
        return {
          answer,
          answerType: retrieval.isMainTopic ? 'MAIN_TOPIC_BASED' : 'CONCEPT_BASED',
          confidence: retrieval.confidence,
          usedKnowledge: true,
        };
      } catch (answerError) {
        logger.warn({ error: answerError?.message }, 'Deep answer generation failed, trying RAG fallback');
        
        // Try RAG fallback
        const fallbackChunks = retrieveFallbackChunks(query, knowledge);
        if (fallbackChunks.length > 0) {
          const answer = await generateDeepAnswer(query, { ...retrieval, hasDirect: false }, knowledge);
          return {
            answer,
            answerType: 'RAG_FALLBACK',
            confidence: 0.3,
            usedKnowledge: false,
          };
        }
      }
    } else {
      // No direct match - try RAG fallback
      const fallbackChunks = retrieveFallbackChunks(query, knowledge);
      if (fallbackChunks.length > 0) {
        const answer = await generateDeepAnswer(query, { ...retrieval, hasDirect: false }, knowledge);
        return {
          answer,
          answerType: 'RAG_FALLBACK',
          confidence: 0.3,
          usedKnowledge: false,
        };
      } else {
        // No content found - answer from general knowledge
        const answer = await generateDeepAnswer(query, { concepts: [], topics: [], hasDirect: false, isMainTopic: false }, knowledge);
        return {
          answer,
          answerType: 'GENERAL_KNOWLEDGE',
          confidence: 0,
          usedKnowledge: false,
        };
      }
    }
  } catch (error) {
    logger.error({ error: error?.message }, 'Advanced knowledge system failed, falling back to hybrid');
    return null; // Fall back to existing system
  }
}

/**
 * UTILITY: Clear knowledge base cache (useful for new videos)
 * @param {String} cacheKey - Specific cache key to clear, or 'ALL'
 */
function clearVideoKnowledgeCache(cacheKey = 'ALL') {
  if (cacheKey === 'ALL') {
    videoKnowledgeCache.clear();
    logger.info('Cleared all video knowledge cache');
  } else {
    videoKnowledgeCache.delete(cacheKey);
    logger.info({ cacheKey }, 'Cleared specific video knowledge cache');
  }
}

/**
 * UTILITY: Get cache statistics
 * @returns {Object} Cache info
 */
function getKnowledgeCacheStats() {
  return {
    cachedVideos: videoKnowledgeCache.size,
    cacheKeys: Array.from(videoKnowledgeCache.keys()),
  };
}

export {
  processQueryWithHybridIntelligence,
  generateFallbackAnswer,
  classifyQuery,
  filterAndScoreChunks,
  calculateSimilarityScore,
  SIMILARITY_THRESHOLD,
  HYBRID_THRESHOLD,
  // Advanced system exports
  buildVideoKnowledge,
  answerWithAdvancedKnowledge,
  processTranscript,
  detectRelevantConcepts,
  retrieveConceptData,
  generateDeepAnswer,
  clearVideoKnowledgeCache,
  getKnowledgeCacheStats,
};
