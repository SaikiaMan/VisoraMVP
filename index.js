import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import logger from './backend/logger.js';
import { createClient } from '@supabase/supabase-js';
import { chunkTexts } from './backend/chunk-text.js';
import { generateAnswer } from './backend/generate-answer.js';
import { generateNotes } from './backend/generate-notes.js';
import { generateQuiz } from './backend/generate-quiz.js';
import { generateWeakTopics } from './backend/generate-weak-topics.js';
import { YoutubeTranscript } from './backend/youtubefetcher.js';
import { cleanTranscript } from './backend/clean-transcript.js';
import {
  checkIndexExists,
  createIndex,
  describeIndexStats,
  retrieveRelevantChunks,
  storeEmbeddings,
  hasStoredChunks,
  getAllChunks,
} from './backend/vectordatabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);
const DEFAULT_VIDEO_URL = 'https://youtu.be/dAF5FngVa7A?si=W0YcpQwORJI0rApq';
const readyNamespaces = new Set();
const initPromises = new Map();
const userState = new Map(); // stores { doubts: [], quizzes: [] } per namespace

// Initialize Supabase admin client (for server-side operations)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Security & middleware ──────────────────────────────────────────
// Disable all CSP headers explicitly - runs BEFORE all routes
app.use((req, res, next) => {
  // Intercept res.setHeader to prevent CSP headers from being set
  const originalSetHeader = res.setHeader;
  res.setHeader = function(name, value) {
    // Block CSP headers completely
    if (name && name.toLowerCase().includes('content-security')) {
      return res; // Don't set CSP headers, but return res for chaining
    }
    // Allow all other headers
    originalSetHeader.call(this, name, value);
    return res; // Return res for chaining
  };
  
  // Also remove any existing CSP headers that might have been set earlier
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('Content-Security-Policy-Report-Only');
  res.removeHeader('X-Content-Security-Policy');
  res.removeHeader('X-Frame-Options');
  
  // Allow CORS and framing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  next();
});

const isDev = process.env.NODE_ENV !== 'production';

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15,             // 15 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please try again later.' },
});
app.use('/api/', apiLimiter);

// Note: express.static for frontend is already called at the bottom of the file (around line 460)
// Removing the redundant static call here to match origin/main logic.

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
  logger.info({ videoUrl, namespace }, 'Processing YouTube video');

  try {
    logger.info('Fetching transcript...');
    const transcriptArr = await YoutubeTranscript.fetchTranscript(videoUrl);
    logger.info({ count: transcriptArr.length }, 'Transcript fetched');

    if (!Array.isArray(transcriptArr) || transcriptArr.length === 0) {
      const msg = 'Could not fetch transcript. Make sure the video has captions (auto-generated or manual).';
      logger.warn(msg);
      throw new Error(msg);
    }

    logger.info('Cleaning transcript...');
    const cleanedArr = cleanTranscript(transcriptArr);

    const fullText = cleanedArr.map((item) => item.text).join(' ').trim();
    if (!fullText) {
      throw new Error('Transcript text is empty after cleaning.');
    }
    logger.info({ length: fullText.length }, 'Cleaned text');

    logger.info('Chunking text...');
    let chunks = chunkTexts(fullText);

    // Adaptive re-chunking: if transcript is long but chunk count is still low,
    // split into smaller chunks to improve retrieval coverage.
    if (fullText.length > 1200 && chunks.length < 8) {
      logger.info('Re-chunking with smaller windows for better coverage');
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
        logger.info({ count: fallbackChunks.length }, 'Using fallback sliding chunks');
        chunks = fallbackChunks;
      }
    }

    if (!Array.isArray(chunks) || chunks.length === 0) {
      throw new Error('No chunks could be created from transcript.');
    }
    logger.info({ count: chunks.length }, 'Chunks created');

    logger.info('Storing embeddings...');
    await storeEmbeddings(chunks, namespace);

    logger.info({ namespace, chunks: chunks.length }, 'Video processed successfully');
  } catch (error) {
    logger.error({ err: error.message }, 'Failed to process YouTube video');
    throw new Error(`Video processing failed: ${error.message}`);
  }
};

const initNamespace = async (videoUrl) => {
  const namespace = extractVideoId(videoUrl);
  logger.info({ namespace }, 'Initializing namespace');

  const indexExists = await checkIndexExists();
  logger.info({ indexExists }, 'Index check');

  if (!indexExists) {
    await createIndex();
  } else {
    const indexStats = await describeIndexStats();
    logger.info({ indexStats }, 'Index stats');
  }

  // Check if this specific namespace already has chunks stored
  const chunksExist = await hasStoredChunks(namespace);
  logger.info({ namespace, chunksExist }, 'Chunk existence check');

  if (!chunksExist) {
    logger.info('Downloading and processing new video...');
    await processYoutube(videoUrl, namespace);
  } else {
    logger.info('Video already processed, using cached chunks');
  }

  logger.info({ namespace }, 'Namespace initialization complete');
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

// Serve Supabase configuration to frontend
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  });
});

// Auto-confirm user email after signup
app.post('/api/confirm-email', async (req, res) => {
  const { userId, email } = req.body;

  if (!userId || !email) {
    return res.status(400).json({
      ok: false,
      error: 'userId and email are required',
    });
  }

  try {
    // Check if service role key is available
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY not configured. Email confirmation disabled.');
      return res.status(200).json({
        ok: true,
        message: 'Service role key not configured',
      });
    }

    console.log(`📧 Confirming email for user: ${email} (ID: ${userId})`);
    
    // Use admin API to confirm email - correct method
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email_confirm: true,
      user_metadata: {
        email_confirmed_at: new Date().toISOString(),
      }
    });

    if (error) {
      console.error('❌ Email confirmation error:', error);
      return res.status(500).json({
        ok: false,
        error: error.message,
      });
    }

    console.log(`✅ Email confirmed for user: ${email}`);
    res.json({
      ok: true,
      message: 'Email confirmed successfully',
      data: data,
    });
  } catch (error) {
    console.error('❌ Email confirmation failed:', error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post('/api/init', async (req, res) => {
  const videoUrl = (req.body?.videoUrl || DEFAULT_VIDEO_URL).trim();

  try {
    logger.info({ videoUrl }, 'Initializing video');
    const namespace = await ensureVideoReady(videoUrl);
    logger.info({ namespace }, 'Video initialization successful');
    res.json({ ok: true, namespace, videoUrl });
  } catch (error) {
    const errorMsg = error && error.message ? error.message : 'Failed to initialize video context.';
    logger.error({ err: errorMsg }, 'Initialization failed');
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

  // Input sanitization: reject excessively long queries
  if (query.length > 500) {
    res.status(400).json({ ok: false, error: 'Query must be 500 characters or fewer.' });
    return;
  }

  try {
    const namespace = await ensureVideoReady(videoUrl);

    if (!userState.has(namespace)) userState.set(namespace, { doubts: [], quizzes: [] });
    userState.get(namespace).doubts.push(query);

    const relevantChunksMatchingQuery = await retrieveRelevantChunks(query, namespace);
    const answer = await generateAnswer(query, relevantChunksMatchingQuery);

    res.json({
      ok: true,
      answer,
      chunkCount: relevantChunksMatchingQuery.length,
      namespace,
    });
  } catch (error) {
    logger.error({ err: error?.message }, 'Failed to answer query');
    res.status(500).json({
      ok: false,
      error: (error && error.message) || 'Failed to answer query.',
    });
  }
});

app.post('/api/notes', async (req, res) => {
  const videoUrl = (req.body?.videoUrl || DEFAULT_VIDEO_URL).trim();

  try {
    const namespace = await ensureVideoReady(videoUrl);
    if (!userState.has(namespace)) userState.set(namespace, { doubts: [], quizzes: [] });
    
    const allChunks = await getAllChunks(namespace);
    const notesChunkText = allChunks; // already strings
    const notes = await generateNotes(notesChunkText);

    res.json({
      ok: true,
      notes,
      namespace,
    });
  } catch (error) {
    console.error('Failed to generate notes:', error);
    res.status(500).json({
      ok: false,
      error: (error && error.message) || 'Failed to generate notes.',
    });
  }
});

app.post('/api/quiz', async (req, res) => {
  const videoUrl = (req.body?.videoUrl || DEFAULT_VIDEO_URL).trim();

  try {
    const namespace = await ensureVideoReady(videoUrl);
    if (!userState.has(namespace)) userState.set(namespace, { doubts: [], quizzes: [] });

    const allChunks = await getAllChunks(namespace);
    const quiz = await generateQuiz(allChunks);

    res.json({ ok: true, quiz, namespace });
  } catch (error) {
    console.error('Failed to generate quiz:', error);
    res.status(500).json({ ok: false, error: (error && error.message) || 'Failed to generate quiz.' });
  }
});

// submit a single quiz score for weak topic analysis 
app.post('/api/quiz/submit', async (req, res) => {
  const videoUrl = (req.body?.videoUrl || DEFAULT_VIDEO_URL).trim();
  const { score, total, missed } = req.body;

  try {
    const namespace = await ensureVideoReady(videoUrl);
    if (!userState.has(namespace)) userState.set(namespace, { doubts: [], quizzes: [] });

    userState.get(namespace).quizzes.push({ score, total, missed: missed || [] });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error && error.message) || 'Failed to submit quiz.' });
  }
});

app.post('/api/weak-topics', async (req, res) => {
  const videoUrl = (req.body?.videoUrl || DEFAULT_VIDEO_URL).trim();

  try {
    const namespace = await ensureVideoReady(videoUrl);
    const state = userState.get(namespace) || { doubts: [], quizzes: [] };
    const allChunks = await getAllChunks(namespace);

    const weakTopics = await generateWeakTopics(allChunks, state);

    res.json({ ok: true, weakTopics });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error && error.message) || 'Failed to generate weak topics.' });
  }
});

// Serve static files (CSS, JS, images, etc.) after all API routes
app.use(express.static(path.join(__dirname, 'frontend')));

// Final CSP cleanup - remove any CSP headers that made it past previous middleware
app.use((req, res, next) => {
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('Content-Security-Policy-Report-Only');
  res.removeHeader('X-Content-Security-Policy');
  res.removeHeader('X-Frame-Options');
  next();
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.listen(port, () => {
  logger.info({ port }, 'Visora web app is running');
});
