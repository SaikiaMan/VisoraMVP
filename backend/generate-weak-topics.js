export async function generateWeakTopics(transcriptChunks, userState) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set.');

  let context = transcriptChunks.join(' ');
  if (context.length > 15000) {
    context = context.substring(0, 15000) + '\n\n... [Transcript truncated]';
  }

  const doubts = (userState.doubts || []).length > 0 ? userState.doubts.join(', ') : 'No doubts asked yet.';
  const scores = (userState.quizzes || []).length > 0 ? userState.quizzes.map(q => `Score: ${q.score}/${q.total}. Missed questions: ${q.missed.join(' | ')}`).join('\n') : 'No quizzes taken yet.';

  const systemMessage = `You are an expert AI tutor identifying weak topics for a student.
Based on the provided video transcript text, the questions they frequently asked in chat, and the answers they got wrong in quizzes, highlight 2-3 weak theoretical areas they should revise.
Output the analysis purely in Markdown using simple headings, brief paragraphs, and bullet points. Be constructive and concise.`;

  const userMessage = `Transcript: ${context}
  
Student Doubts: ${doubts}

Student Quiz Performance:
${scores}`;

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error((data.error && data.error.message) || 'Groq error');

  return data.choices[0].message.content;
}