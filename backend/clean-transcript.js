function formatTime(offsetMs) {
  const totalSeconds = Math.floor(offsetMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
}

function cleanTranscript(transcriptArr) { 
  return transcriptArr.map(item => ({
    ...item,
    text: `${formatTime(item.offset || 0)} ${item.text
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim()}`
  }));
}

export { cleanTranscript }
