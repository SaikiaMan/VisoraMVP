# Hybrid Intelligence System - Implementation Guide

## Overview

The Visora YouTube AI Copilot has been upgraded with a **Hybrid Intelligence System** that intelligently routes queries between transcript-based RAG and general knowledge LLM responses.

---

## Architecture

### Query Processing Pipeline

```
User Query
    ↓
[Chunk Retrieval] → vectordatabase.retrieveRelevantChunks()
    ↓
[Similarity Scoring] → calculateSimilarityScore() [0-1 scale]
    ↓
[Query Classification] → classifyQuery() → TRANSCRIPT | GENERAL | HYBRID
    ↓
[Routing Decision]
    ├─ TRANSCRIPT → RAG + LLM (transcript-focused)
    ├─ GENERAL → LLM only (no transcript)
    └─ HYBRID → RAG + LLM (combined)
    ↓
[Answer Generation] → generateHybridAnswer()
    ↓
[Polish & Format] → ChatGPT-style output
    ↓
User Receives Answer
```

---

## New Files Added

### 1. `backend/hybrid-intelligence.js`
**Purpose**: Core hybrid intelligence logic and routing

**Key Functions**:

#### `calculateSimilarityScore(query, chunk) → number (0-1)`
- Normalized token matching
- Contextual relevance scoring
- Returns normalized similarity (0-1 range)
- Handles edge cases (empty chunks, low-relevance text)

#### `filterAndScoreChunks(chunks, query) → Object`
```javascript
{
  relevantChunks: Array<string>,  // Chunks above SIMILARITY_THRESHOLD
  avgScore: number,               // Average relevance score
  maxScore: number                // Highest relevance score
}
```
- Filters chunks below similarity threshold
- Returns only high-confidence chunks
- Allows low-relevance queries to skip RAG

#### `classifyQuery(query, chunks, avgSimilarity) → Promise<"TRANSCRIPT"|"GENERAL"|"HYBRID">`
- Quick classification based on similarity scores
- Falls back to LLM classification for edge cases
- Cache-friendly heuristics for performance

**Query Type Logic**:
- **TRANSCRIPT**: `avgSimilarity ≥ 0.65` → Answer from transcript
- **GENERAL**: `avgSimilarity < 0.50` AND no chunks → General knowledge
- **HYBRID**: `0.50 ≤ avgSimilarity < 0.65` → Combined approach

#### `generateHybridAnswer(query, chunks, queryType) → Promise<string>`
- Type-specific prompting
- Two-pass generation (raw → polish)
- System prompt adapts based on queryType
- Outputs pure text (no markdown)

#### `processQueryWithHybridIntelligence(query, rawChunks) → Promise<Object>`
```javascript
{
  answer: string,           // Generated answer
  queryType: string,        // TRANSCRIPT | GENERAL | HYBRID
  usedTranscript: boolean,  // Whether transcript was used
  relevanceScore: number    // [0-1] overall relevance
}
```
**Main orchestrator function** - handles the complete pipeline

#### `generateFallbackAnswer(query, relevanceScore) → string`
- Graceful fallback for edge cases
- Suggests user actions (rephrase, etc.)

---

## Modified Files

### 1. `backend/generate-answer.js`
**Changes**:
- Now wraps hybrid intelligence pipeline
- Maintains backward compatibility with API
- Imports and uses `processQueryWithHybridIntelligence()`
- Enhanced error handling with fallback mechanism

**Key Change**:
```javascript
// OLD: Direct RAG + LLM
async function generateAnswer(query, retrievedChunks) {
  // ... complex two-pass logic

// NEW: Hybrid routing
async function generateAnswer(query, retrievedChunks) {
  const result = await processQueryWithHybridIntelligence(query, retrievedChunks);
  return result.answer; // Already polished
}
```

**Benefits**:
- Cleaner, more maintainable
- All complex logic in dedicated module
- Can easily swap implementations
- Fallback error handling

### 2. `backend/vectordatabase.js`
**Changes**:
- Enhanced `retrieveRelevantChunks()` to return up to 20 chunks (was 12)
- Added `retrieveChunksWithScores()` function
- Updated export list

**New Function**:
```javascript
retrieveChunksWithScores(query, namespace) → Promise<Array<{chunk, score}>>
```
- Returns chunks with individual similarity scores
- Available for future implementations
- Currently used internally by hybrid system

---

## Configuration Constants

Located in `hybrid-intelligence.js`:

```javascript
SIMILARITY_THRESHOLD = 0.65    // Min score for TRANSCRIPT type
HYBRID_THRESHOLD = 0.50        // Boundary between GENERAL and HYBRID
MIN_CHUNK_LENGTH = 30          // Minimum characters for valid chunk
```

**Tuning Guide**:
- **Lower SIMILARITY_THRESHOLD** → More aggressive RAG usage
- **Higher SIMILARITY_THRESHOLD** → Prefer general knowledge
- **MIN_CHUNK_LENGTH** → Ignore very small chunks

---

## Query Type Decision Tree

```
Is avgSimilarity >= 0.65?
├─ YES → TRANSCRIPT
│        (Use RAG + LLM, answer from transcript)
│
└─ NO → Is avgSimilarity >= 0.50 AND chunks available?
        ├─ YES → HYBRID
        │        (Combine transcript context + knowledge)
        │
        └─ NO → GENERAL
                (Pure LLM, no transcript)
```

---

## System Prompts by Type

### TRANSCRIPT Mode
- Focus: Extract information directly from transcript
- Instruction: Never make up information
- Behavior: Cite video content specifically

### GENERAL Mode
- Focus: General knowledge explanation
- Instruction: Don't mention video/transcript
- Behavior: Provide clear educational answer

### HYBRID Mode
- Focus: Balance both sources
- Instruction: Clearly separate video content from knowledge
- Behavior: Connect them together naturally

---

## Similarity Score Calculation

Token-based matching with contextual weighting:

```javascript
// For each query token:
- Exact word match (spaces): +2 points
- Substring match: +1 point
- Multiple matches bonus: +matches * 0.2

// Final score = matches / max_possible_score (capped at 1.0)
```

**Examples**:
- Query: "machine learning" vs Chunk: "Machine Learning is..."
  → Score: ~0.95 (high relevance)
  
- Query: "how to code" vs Chunk: "Programming basics..."
  → Score: ~0.50 (medium relevance)
  
- Query: "quantum physics" vs Chunk: "The video discusses..."
  → Score: ~0.10 (low relevance)

---

## Backward Compatibility

✅ **All existing APIs unchanged**:
- `/api/ask` - Same request/response format
- `/api/init` - No changes
- `generateAnswer()` - Same signature
- `retrieveRelevantChunks()` - Still returns array of chunks

✅ **Drop-in replacement**:
- No changes needed in frontend
- No changes needed in `index.js`
- Hybrid logic is transparent to caller

---

## Performance Considerations

**Optimizations**:
1. Quick similarity checks before LLM classification
2. Fallback to heuristics if LLM classification fails
3. Returns top 20 chunks for efficient processing
4. Timeout handling for stuck requests

**Expected Latency**:
- TRANSCRIPT: ~2-3 seconds (RAG + LLM + polish)
- GENERAL: ~2-3 seconds (LLM + polish)
- HYBRID: ~2-3 seconds (RAG + LLM + polish)

---

## Error Handling

### Fallback Mechanism
```javascript
try {
  Hybrid Intelligence Pipeline
} catch {
  Fallback Answer
    ↓
  If still fails: Generic error message
}
```

**Fallback levels**:
1. Primary: Hybrid intelligence
2. Secondary: Fallback answer generator
3. Tertiary: Generic error message

---

## Example Workflows

### Scenario 1: Transcript-Heavy Question
```
Q: "What does the instructor say about K-means clustering?"

avgSimilarity: 0.78
queryType: TRANSCRIPT
→ Uses RAG + focuses on transcript content
→ Extracts specific information from video
→ Returns accurate, cited answer
```

### Scenario 2: General Knowledge Question
```
Q: "What is photosynthesis?"

avgSimilarity: 0.15 (no transcript mention)
queryType: GENERAL
→ Uses pure LLM, skips RAG
→ Provides clear general explanation
→ No false references to video
```

### Scenario 3: Hybrid Question
```
Q: "How does this machine learning concept apply to recommendation systems?"

avgSimilarity: 0.58
queryType: HYBRID
→ Uses both transcript context + general knowledge
→ Bridges video concepts to broader applications
→ Combines sources intelligently
```

---

## Future Enhancements

Planned features for next version:

1. **Conversation Memory**
   - Store last 3-5 queries per session
   - Use for follow-up question understanding
   - Improve context awareness

2. **Fine-tuned Thresholds**
   - Per-video adaptation
   - Learn from user satisfaction
   - Dynamic threshold adjustment

3. **Source Attribution**
   - Mark answers: "From Video", "General Knowledge", "Combined"
   - Show confidence scores
   - Let users filter by source

4. **Multi-language Support**
   - Already handles Hindi in chunking
   - Extend classifyQuery to other languages
   - Better non-English similarity matching

5. **Answer Caching**
   - Cache similar queries for faster response
   - Reduce API calls
   - Improve user experience

---

## Testing Checklist

- [ ] Test TRANSCRIPT mode (asks about video content)
- [ ] Test GENERAL mode (general knowledge question)
- [ ] Test HYBRID mode (mixed question)
- [ ] Test low-relevance fallback
- [ ] Test with empty chunks
- [ ] Test error recovery
- [ ] Verify ChatGPT-style output
- [ ] Check latency metrics
- [ ] Validate similarity scores

---

## Code Quality

**Standards maintained**:
- ✅ Production-level code
- ✅ Comprehensive comments
- ✅ Error handling throughout
- ✅ Logging for debugging
- ✅ Modular functions
- ✅ No breaking changes
- ✅ Backward compatible

---

## Questions?

For integration questions or feature requests, refer to the inline comments in:
- `backend/hybrid-intelligence.js` (main logic)
- `backend/generate-answer.js` (API wrapper)
- `backend/vectordatabase.js` (retrieval enhancements)
