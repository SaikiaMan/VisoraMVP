function chunkTexts(text, chunkSize = 800, overlapSize = 150) {
  if (overlapSize >= chunkSize) throw new Error("Overlap must be smaller than chunk size");

  // Split on English (.!?) or Hindi (।) sentence boundaries, or newlines
  const sentences = text.match(/[^.!?\n।]+[.!?\n।]*/g) || [text];

  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    // If a single sentence is itself larger than chunkSize, force-split it
    if (sentence.length > chunkSize) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = "";
      }
      let i = 0;
      while (i < sentence.length) {
        const slice = sentence.slice(i, i + chunkSize);
        chunks.push(slice.trim());
        i += chunkSize - overlapSize;
      }
      continue;
    }

    if ((current + sentence).length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = current.slice(-overlapSize) + sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export { chunkTexts }
