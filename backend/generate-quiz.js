export async function generateQuiz(transcriptChunks) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set.');

  let context = transcriptChunks.join(' ');
  if (context.length > 15000) {
    context = context.substring(0, 15000) + '\n\n... [Transcript truncated]';
  }

  const systemMessage = `You are an expert AI quiz generator.
Based on the transcript context, generate a JSON array of 5 to 10 multiple choice questions.
Return ONLY valid JSON in this exact structure, with no markdown formatting or extra text:
{
  "quiz": [
    {
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answerIndex": 0,
      "explanation": "Explanation string"
    }
  ]
}`;

  const userMessage = `Transcript Context: ${context}\n\nPlease generate the JSON quiz.`;

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error((data.error && data.error.message) || 'Groq error');

  return JSON.parse(data.choices[0].message.content).quiz;
}
