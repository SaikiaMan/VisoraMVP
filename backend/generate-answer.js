import logger from './logger.js';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

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

async function generateAnswer(query, retrievedChunks) {
  const hasContext = Array.isArray(retrievedChunks) && retrievedChunks.length > 0;

  if (!hasContext) {
    return 'I do not have enough context to answer this question. Please try asking about content from the video, or load a different video.';
  }

  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set. Please add it to your .env file before running the app.');
  }

  const context = retrievedChunks.join(' ');

  try {
    // ── PASS 1: Raw answer ────────────────────────────────────────────────
    const rawAnswer = await callGroq([
      {
        role: 'system',
        content: `You are an AI tutor helping students learn from video lectures and transcripts.
Your role is to:
1. Answer questions based ONLY on the provided context/transcript
2. Extract relevant information from the context to answer the student's question
3. Be helpful and explain concepts clearly
4. If the exact answer isn't in the context, try to provide related information that might help

Important: Only decline to answer if the context is completely irrelevant to the question.`,
      },
      {
        role: 'user',
        content: `Transcript Context: ${context}\n\nQuestion: ${query}\n\nPlease answer based on the provided transcript context.`,
      },
    ]);

    // ── PASS 2: Refinement ────────────────────────────────────────────────
    const refinedAnswer = await callGroq([
      {
        role: 'system',
        content: `You are a helpful AI tutor. Write responses EXACTLY like ChatGPT - completely plain text.

CRITICAL RULES - DO NOT BREAK THESE:
- NO ### headings (remove all of them)
- NO bullet points or asterisks (* or -)
- NO numbered lists (1. 2. 3.)
- NO **bold** text with double asterisks
- NO bold formatting at all
- NO markdown of any kind
- Just write plain paragraphs separated by line breaks

Write naturally as conversational paragraphs. Flow from thought to thought. This is how ChatGPT writes.

EXAMPLE OF CORRECT FORMAT:
Machine Learning is a technique where computers learn from data to recognize patterns and make decisions automatically. The computer is trained to divide data into different groups so it can keep similar data together based on common characteristics. This process involves training the computer to understand customer behavior and group customers by age, income, and other features.

There are many fields where machine learning is used, including marketing, healthcare, and entertainment.

That's the format. Plain text, no special formatting at all.`,
      },
      {
        role: 'user',
        content: `Original question: ${query}\n\nDraft answer:\n${rawAnswer}\n\nRewrite this EXACTLY like ChatGPT - completely plain text with NO markdown, NO bold, NO asterisks, NO headings, just natural paragraphs.`,
      },
    ]);

    let finalAnswer = refinedAnswer || rawAnswer || 'I do not have enough info to answer this question.';

    // Sanitization step: Strip any leaked RAG metadata like "[Video: id | Chunks: N]"
    finalAnswer = finalAnswer
      .replace(/\[\s*(Video|Chunks|Namespace)[^\]]*\]/gi, '')
      .trim();

    return finalAnswer;
  } catch (error) {
    logger.error({ err: error?.message }, 'Error generating answer');
    return 'There was an error generating an answer. Please try again later.';
  }
}

export { generateAnswer };