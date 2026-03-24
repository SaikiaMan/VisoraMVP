function cleanTranscript(transcriptArr) { 
  return transcriptArr.map(item => ({ 
    ...item, 
    text: item.text 
      .replace(/\n/g, " ") 
      .replace(/\s+/g, " ") 
      .trim() 
  }));
}

export { cleanTranscript }
