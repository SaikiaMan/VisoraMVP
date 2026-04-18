function chunkTexts(text, chunkSize = 350, overlapSize = 80) {
  if (overlapSize >= chunkSize) throw new Error("Overlap must be smaller than chunk size");

  // Split on English (.!?) or Hindi (।) sentence boundaries, or newlines
  const sentences = text.match(/[^.!?\n।]+[.!?\n।]*/g) || [text];

  const chunks = [];
  let current = "";
  let currentTimestamp = null;
  let firstTimestampInChunk = null;

  for (const sentence of sentences) {
    // Extract timestamp from sentence if it exists: [MM:SS] or [HH:MM:SS]
    const timestampMatch = sentence.match(/\[(\d{1,2}):(\d{2}):?(\d{2})?\]/);
    let timestamp = null;
    
    if (timestampMatch) {
      timestamp = timestampMatch[0]; // Keep the [MM:SS] format
      if (!firstTimestampInChunk) {
        firstTimestampInChunk = timestamp;
      }
      currentTimestamp = timestamp;
    }

    // If a single sentence is itself larger than chunkSize, force-split it
    if (sentence.length > chunkSize && current.length > 0) {
      // Save current chunk with timestamp
      chunks.push({
        content: current.trim(),
        timestamp: firstTimestampInChunk || null
      });
      current = "";
      firstTimestampInChunk = null;
    }

    if ((current + sentence).length > chunkSize && current.length > 0) {
      // Save current chunk with timestamp
      chunks.push({
        content: current.trim(),
        timestamp: firstTimestampInChunk || null
      });
      current = current.slice(-overlapSize) + sentence;
      firstTimestampInChunk = currentTimestamp || firstTimestampInChunk;
    } else {
      current += sentence;
    }
  }

  if (current.trim()) {
    chunks.push({
      content: current.trim(),
      timestamp: firstTimestampInChunk || null
    });
  }

  return chunks;
}

export { chunkTexts }
