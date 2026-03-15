const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function generateAnswer(query, retrievedChunks) {
  if (!Array.isArray(retrievedChunks) || retrievedChunks.length === 0) {
    return 'I do not have enough info to answer this question.';
  }

  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      'GROQ_API_KEY is not set. Please add it to your .env file before running the app.'
    );
  }

  const context = retrievedChunks.join(' ');

  const systemMessage = `You are an AI tutor that answers questions strictly based on the provided context.
Always respond in clear English, even if the source context is in another language.
If the context doesn't contain enough information, respond with "I do not have enough info to answer this question."`;

  const userMessage = `Context: ${context}\n\nQuestion: ${query}\n\nReturn the final answer in English only.`;

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
