const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function generateNotes(transcriptChunks) {
  const hasContext = Array.isArray(transcriptChunks) && transcriptChunks.length > 0;

  if (!hasContext) {
    return 'I do not have enough context to generate notes for this video.';
  }

  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set.');
  }

  // Limit context to ~15,000 characters to prevent Groq API rate limit errors (Tokens Per Day)
  let context = transcriptChunks.join(' ');
  if (context.length > 15000) {
    context = context.substring(0, 15000) + '\n\n... [Transcript truncated to fit API limits]';
  }

  const systemMessage = `You are an expert AI tutor and note-taker.
Your task is to generate comprehensive, structured study notes based ONLY on the provided video transcript.
The notes should be formatted in Markdown, using clear headings, bullet points, bold text for key terms, and summaries. Avoid generic conversational phrases, just output the notes.`;

  const userMessage = `Transcript Context: ${context}\n\nPlease generate detailed structured notes.`;

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
    if (!resp.ok) throw new Error(`Groq API error: ${JSON.stringify(data)}`);

    const text = data?.choices?.[0]?.message?.content ?? '';
    return text.trim() || 'Could not generate notes.'; 
  } catch (error) {
    console.error('Error generating notes:', error?.message || error);
    throw error;
  }
}

export { generateNotes };
