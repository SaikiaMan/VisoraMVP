import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { chunkTexts } from './backend/chunk-text.js';
import { generateAnswer } from './backend/generate-answer.js';
import { YoutubeTranscript } from './backend/youtubefetcher.js';
import { cleanTranscript } from './backend/clean-transcript.js';
import {
  checkIndexExists,
  createIndex,
  describeIndexStats,
  retrieveRelevantChunks,
  storeEmbeddings,
  hasStoredChunks,
} from './backend/vectordatabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);
const DEFAULT_VIDEO_URL = 'https://youtu.be/dAF5FngVa7A?si=W0YcpQwORJI0rApq';
const readyNamespaces = new Set();
const initPromises = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

const extractVideoId = (url) => {
  const match = url.match(/(?:v=|youtu\.be\/)([^&?/]{11})/);
  return match ? match[1] : url;
};

const ensureMinimumChunkCount = (chunks, minCount = 12, minChunkLength = 60) => {
  if (!Array.isArray(chunks)) {
    return [];
  }

  let expanded = [...chunks];

  // Iteratively split the longest chunks until we reach the target count
  // or cannot split further without making chunks too small.
  while (expanded.length < minCount) {
    let longestIndex = -1;
    let longestLength = 0;

    for (let i = 0; i < expanded.length; i += 1) {
      const len = (expanded[i] || '').length;
      if (len > longestLength) {
        longestLength = len;
        longestIndex = i;
      }
    }

    if (longestIndex === -1 || longestLength < minChunkLength * 2) {
      break;
    }

    const target = expanded[longestIndex];
    const midpoint = Math.floor(target.length / 2);

    // Prefer splitting on whitespace near the midpoint to avoid cutting words.
    let splitAt = target.lastIndexOf(' ', midpoint);
    if (splitAt < minChunkLength) {
      splitAt = target.indexOf(' ', midpoint);
    }
    if (splitAt === -1) {
      splitAt = midpoint;
    }

    const left = target.slice(0, splitAt).trim();
    const right = target.slice(splitAt).trim();

    if (!left || !right || left.length < minChunkLength || right.length < minChunkLength) {
      break;
    }

    expanded.splice(longestIndex, 1, left, right);
  }

  return expanded;
};

const processYoutube = async (videoUrl, namespace) => {
  console.log('🎥 Processing YouTube video:', videoUrl);
  console.log('📌 Namespace:', namespace);

  try {
    console.log('⏳ Fetching transcript...');
    const transcriptArr = await YoutubeTranscript.fetchTranscript(videoUrl);
    console.log('✓ Transcript fetched:', transcriptArr.length, 'items');

    if (!Array.isArray(transcriptArr) || transcriptArr.length === 0) {
      const msg = 'Could not fetch transcript. Make sure the video has captions (auto-generated or manual).';
      console.warn('❌', msg);
      throw new Error(msg);
    }

    console.log('🧹 Cleaning transcript...');
    const cleanedArr = cleanTranscript(transcriptArr);

    const fullText = cleanedArr.map((item) => item.text).join(' ').trim();
    if (!fullText) {
      throw new Error('Transcript text is empty after cleaning.');
    }
    console.log('✓ Cleaned text length:', fullText.length);

    console.log('📦 Chunking text...');
    let chunks = chunkTexts(fullText);

    // Adaptive re-chunking: if transcript is long but chunk count is still low,
    // split into smaller chunks to improve retrieval coverage.
    if (fullText.length > 1200 && chunks.length < 8) {
      console.log('♻️ Re-chunking with smaller windows for better coverage...');
      chunks = chunkTexts(fullText, 260, 60);
    }

    chunks = ensureMinimumChunkCount(chunks, 12, 60);

    // Final fallback: generate fixed sliding-window chunks directly from text
    // so retrieval has enough candidates even on very short/sparse transcripts.
    if (chunks.length < 12 && fullText.length > 0) {
      const target = 12;
      const windowSize = Math.max(90, Math.ceil(fullText.length / target));
      const overlap = Math.floor(windowSize * 0.2);
      const step = Math.max(1, windowSize - overlap);
      const fallbackChunks = [];

      for (let i = 0; i < fullText.length; i += step) {
        const piece = fullText.slice(i, i + windowSize).trim();
        if (piece) {
          fallbackChunks.push(piece);
        }
        if (fallbackChunks.length >= target) {
          break;
        }
      }

      if (fallbackChunks.length > chunks.length) {
        console.log(`♻️ Using fallback sliding chunks: ${fallbackChunks.length}`);
        chunks = fallbackChunks;
      }
    }

    if (!Array.isArray(chunks) || chunks.length === 0) {
      throw new Error('No chunks could be created from transcript.');
    }
    console.log('✓ Created', chunks.length, 'chunks');

    console.log('💾 Storing embeddings...');
    await storeEmbeddings(chunks, namespace);

    console.log(`✅ Video processed successfully. Namespace: ${namespace}, Chunks: ${chunks.length}`);
  } catch (error) {
    console.error('❌ Failed to process YouTube video:', error.message);
    throw new Error(`Video processing failed: ${error.message}`);
  }
};

const initNamespace = async (videoUrl) => {
  const namespace = extractVideoId(videoUrl);
  console.log('🔄 Initialize namespace for video ID:', namespace);

  const indexExists = await checkIndexExists();
  console.log('📊 Index exists:', indexExists);

  if (!indexExists) {
    await createIndex();
  } else {
    const indexStats = await describeIndexStats();
    console.log('📈 Index stats:', indexStats);
  }

  // Check if this specific namespace already has chunks stored
  console.log('🔍 Checking if chunks exist for namespace:', namespace);
  const chunksExist = await hasStoredChunks(namespace);
  console.log('📦 Chunks exist:', chunksExist);

  if (!chunksExist) {
    console.log('⬇️  Downloading and processing new video...');
    await processYoutube(videoUrl, namespace);
  } else {
    console.log('✓ Video already processed, using cached chunks');
  }

  console.log('✅ Namespace initialization complete:', namespace);
  return namespace;
};

const ensureVideoReady = async (videoUrl) => {
  const namespace = extractVideoId(videoUrl);

  if (readyNamespaces.has(namespace)) {
    return namespace;
  }

  if (initPromises.has(namespace)) {
    return initPromises.get(namespace);
  }

  const initPromise = (async () => {
    const initializedNamespace = await initNamespace(videoUrl);
    readyNamespaces.add(initializedNamespace);
    return initializedNamespace;
  })();

  initPromises.set(namespace, initPromise);

  try {
    return await initPromise;
  } finally {
    initPromises.delete(namespace);
  }
};

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/init', async (req, res) => {
  const videoUrl = (req.body?.videoUrl || DEFAULT_VIDEO_URL).trim();

  try {
    console.log('Initializing for video:', videoUrl);
    const namespace = await ensureVideoReady(videoUrl);
    console.log('Video initialization successful, namespace:', namespace);
    res.json({ ok: true, namespace, videoUrl });
  } catch (error) {
    const errorMsg = error && error.message ? error.message : 'Failed to initialize video context.';
    console.error('Initialization failed:', errorMsg);
    res.status(500).json({
      ok: false,
      error: errorMsg,
    });
  }
});

app.post('/api/ask', async (req, res) => {
  const videoUrl = (req.body?.videoUrl || DEFAULT_VIDEO_URL).trim();
  const query = (req.body?.query || '').trim();

  if (!query) {
    res.status(400).json({ ok: false, error: 'Query is required.' });
    return;
  }

  try {
    const namespace = await ensureVideoReady(videoUrl);
    const relevantChunksMatchingQuery = await retrieveRelevantChunks(query, namespace);
    const answer = await generateAnswer(query, relevantChunksMatchingQuery);

    res.json({
      ok: true,
      answer,
      chunkCount: relevantChunksMatchingQuery.length,
      namespace,
    });
  } catch (error) {
    console.error('Failed to answer query:', error);
    res.status(500).json({
      ok: false,
      error: (error && error.message) || 'Failed to answer query.',
    });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.listen(port, () => {
  console.log(`Visora web app is running at http://localhost:${port}`);
});
