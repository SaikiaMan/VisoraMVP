import 'dotenv/config';
import readline from 'readline';
import { chunkTexts } from './backend/chunk-text.js';
import { embedTexts } from './backend/embedder-text.js';
import { generateAnswer } from './backend/generate-answer.js';
import { YoutubeTranscript } from './backend/youtubefetcher.js';
import { cleanTranscript } from './backend/clean-transcript.js';
import {
  checkIndexExists,
  createIndex,
  describeIndexStats,
  retrieveRelevantChunks,
  storeEmbeddings
} from './backend/vectordatabase.js';

const processYoutube = async (videoUrl) => {
  console.log('Processing YouTube video', videoUrl);

  try {
    const transcriptArr = await YoutubeTranscript.fetchTranscript(videoUrl);

    if (!Array.isArray(transcriptArr) || transcriptArr.length === 0) {
      throw new Error('Transcript array is empty. The video may not have captions.');
    }

    const cleanedArr = cleanTranscript(transcriptArr);

    const fullText = cleanedArr.map((item) => item.text).join(' ').trim();
    if (!fullText) {
      throw new Error('Transcript text is empty after cleaning.');
    }

    const chunks = chunkTexts(fullText);
    if (!Array.isArray(chunks) || chunks.length === 0) {
      throw new Error('No chunks were produced from transcript text.');
    }

    const embeddings = await embedTexts(chunks);
    await storeEmbeddings(embeddings);

    console.log('YouTube video processed and stored successfully');
  } catch (error) {
    console.error('Failed to process YouTube video:', error);
    throw error;
  }
};

const init = async (videoUrl) => {
  const indexExists = await checkIndexExists();
  console.log('Index exists', indexExists);

  if (!indexExists) {
    await createIndex();
  } else {
    const indexStats = await describeIndexStats();
    console.log('Index stats', indexStats);
  }

  const testQuery = 'summary';
  const relevantChunksMatchingQuery = await retrieveRelevantChunks(testQuery);

  if (!relevantChunksMatchingQuery.length) {
    console.log('No matching chunks found, processing YouTube video...');
    await processYoutube(videoUrl);
  } else {
    console.log('Video already indexed, skipping processing');
  }
};

const main = async () => {
  const videoUrl = 'https://youtu.be/cucQtak-jco?si=BqGGyf7xsIjc3RBu'; // ← change this

  try {
    await init(videoUrl);
  } catch (error) {
    console.error('Initialization failed. Please fix the errors above and try again.');
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const promptUser = () => {
    rl.question('Enter your query (type "quit" to exit): ', async (query) => {
      const normalized = query.trim().toLowerCase();

      if (normalized === 'quit' || normalized === 'exit') {
        console.log('Exiting...');
        rl.close();
        return;
      }

      try {
        const relevantChunksMatchingQuery = await retrieveRelevantChunks(query);
        const answer = await generateAnswer(query, relevantChunksMatchingQuery);

        console.log('-----------------------------------');
        console.log(`Query: ${query}`);
        console.log(`\x1b[31mAnswer: ${answer}\x1b[0m`);
        console.log('-----------------------------------');
      } catch (error) {
        console.error('Error while answering your question:', error);
        console.log('There was a problem answering your question. Please try again.');
      }

      promptUser();
    });
  };

  promptUser();
};

main();
