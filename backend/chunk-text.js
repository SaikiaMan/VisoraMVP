function chunkTexts(text, chunkSize = 1000, overlapSize = 200) {
  if (overlapSize >= chunkSize) throw new Error("Overlap must be smaller than chunk size");
  
  const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + sentence).length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      // carry over the tail for overlap
      current = current.slice(-overlapSize) + sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export { chunkTexts }
