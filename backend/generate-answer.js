import { ChatOpenAI } from '@langchain/openai';

async function generateAnswer(query, retrievedChunks) {
  if (!Array.isArray(retrievedChunks) || retrievedChunks.length === 0) {
    return 'I do not have enough info to answer this question.';
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is not set. Please add it to your .env file before running the app.'
    );
  }

  const llm = new ChatOpenAI({
    modelName: "gpt-4o-mini",
  });

  const context = retrievedChunks.join(' ');

  const systemMessage = `You are an AI that answers questions strictly based on the provided context. 
If the context doesn't contain enough information, respond with "I do not have enough info to answer this question."`;

  const userMessage = `Context: ${context}\n\nQuestion: ${query}`;

  try {
    const response = await llm.invoke([
      ["system", systemMessage],
      ["user", userMessage]
    ]);

    const rawContent = response && response.content;
    const content =
      typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((part) =>
                typeof part === 'string'
                  ? part
                  : (part && (part.text || part.content)) || ''
              )
              .join(' ')
          : String(rawContent ?? '');

    return content.trim();
  } catch (error) {
    console.error('Error generating answer with OpenAI:', error);
    return 'There was an error generating an answer. Please try again later.';
  }
}

export { generateAnswer }
