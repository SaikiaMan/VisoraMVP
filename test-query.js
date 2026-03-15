import 'dotenv/config';
import { retrieveRelevantChunks } from './backend/vectordatabase.js';
import { generateAnswer } from './backend/generate-answer.js';

const chunks = await retrieveRelevantChunks('what is this video about');
console.log('Retrieved chunks:', chunks.length);
if (chunks.length > 0) {
  console.log('First chunk preview:', chunks[0].slice(0, 100));
  const answer = await generateAnswer('what is this video about', chunks);
  console.log('Answer:', answer);
} else {
  console.log('No chunks found in Pinecone');
}
process.exit(0);
