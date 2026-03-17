const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function generateAnswer(query, retrievedChunks) {
  // Even with empty chunks, provide what we can
  const hasContext = Array.isArray(retrievedChunks) && retrievedChunks.length > 0;

  if (!hasContext) {
    return 'I do not have enough context to answer this question. Please try asking about content from the video, or load a different video.';
  }

  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      'GROQ_API_KEY is not set. Please add it to your .env file before running the app.'
    );
  }

  const context = retrievedChunks.join(' ');

  const systemMessage = `You are an AI tutor helping students learn from video lectures and transcripts.
Your role is to:
1. Answer questions based ONLY on the provided context/transcript
2. Extract relevant information from the context to answer the student's question
3. Be helpful and explain concepts clearly
4. If the exact answer isn't in the context, try to provide related information that might help

Important: Only decline to answer if the context is completely irrelevant to the question, not just because it's not a perfect match. Try your best to find connections and provide value to the student.`;

  const userMessage = `Transcript Context: ${context}\n\nQuestion: ${query}\n\nPlease answer based on the provided transcript context. Even if it's not a perfect match, try to provide helpful information related to the question.`;

  try {
    const resp = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(`Groq API error: ${JSON.stringify(data)}`);
    }

    const text = data?.choices?.[0]?.message?.content ?? '';
    return text.trim() || 'I do not have enough info to answer this question.';
  } catch (error) {
    console.error('Error generating answer:', error?.message || error);
    return 'There was an error generating an answer. Please try again later.';
  }
}

export { generateAnswer };
