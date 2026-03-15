const GEMINI_MODEL = 'gemini-2.0-flash';

async function generateAnswer(query, retrievedChunks) {
  if (!Array.isArray(retrievedChunks) || retrievedChunks.length === 0) {
    return 'I do not have enough info to answer this question.';
  }

  if (!process.env.GOOGLE_API_KEY) {
    throw new Error(
      'GOOGLE_API_KEY is not set. Please add it to your .env file before running the app.'
    );
  }

  const context = retrievedChunks.join(' ');

  const systemMessage = `You are an AI that answers questions strictly based on the provided context.
If the context doesn't contain enough information, respond with "I do not have enough info to answer this question."`;

  const userMessage = `Context: ${context}\n\nQuestion: ${query}`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemMessage }],
          },
          contents: [
            { role: 'user', parts: [{ text: userMessage }] },
          ],
        }),
      }
    );

    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(`Gemini API error: ${JSON.stringify(data)}`);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return text.trim() || 'I do not have enough info to answer this question.';
  } catch (error) {
    console.error('Error generating answer:', error);
    return 'There was an error generating an answer. Please try again later.';
  }
}

export { generateAnswer };
