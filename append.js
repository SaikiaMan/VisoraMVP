const fs = require('fs');

const jsCode = \

// Notes Generation Logic
const generateNotesBtn = document.getElementById('generateNotesBtn');
const notesPlaceholder = document.getElementById('notesPlaceholder');
const notesContainer = document.getElementById('notesContainer');

if (generateNotesBtn) {
  generateNotesBtn.addEventListener('click', async () => {
    if (!activeVideoUrl || !isReady) {
      alert('Please load a video first!');
      return;
    }

    generateNotesBtn.disabled = true;
    generateNotesBtn.textContent = 'Generating...';

    try {
      const resp = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: activeVideoUrl })
      });

      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        throw new Error(data.error || 'Failed to generate notes.');
      }

      // Convert simple markdown headings to HTML just for display
      let formattedNotes = (data.notes || '')
          .replace(/^### (.*$)/gim, '<h4>\</h4>')
          .replace(/^## (.*$)/gim, '<h3 style=\"margin-top:20px;\">\</h3>')
          .replace(/^# (.*$)/gim, '<h2 style=\"margin-top:20px;\">\</h2>')
          .replace(/\\*\\*(.*?)\\*\\*/gim, '<strong>\</strong>')
          .replace(/\\n/g, '<br/>');

      notesPlaceholder.style.display = 'none';
      notesContainer.style.display = 'block';
      notesContainer.innerHTML = formattedNotes;

    } catch(err) {
      alert('Error generating notes: ' + err.message);
      generateNotesBtn.disabled = false;
      generateNotesBtn.textContent = 'Generate Notes';
    }
  });
}
\;

fs.appendFileSync('frontend/app.js', jsCode);
