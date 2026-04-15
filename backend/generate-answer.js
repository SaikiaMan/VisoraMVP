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
        content: `You are a response editor.

Improve the answer:
- Make it well-structured
- Use clear Markdown (headings, bullets)
- Highlight key terms in **bold**
- Remove repetition
- Improve readability and flow

Do NOT:
- Add new information
- Change meaning
- Hallucinate anything

Return only the improved version.`,
      },
      {
        role: 'user',
        content: `Original question: ${query}\n\nDraft answer:\n${rawAnswer}\n\nPlease provide a refined, polished version of this answer.`,
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