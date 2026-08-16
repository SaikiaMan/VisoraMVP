const defaultVideoUrl = 'https://youtu.be/dAF5FngVa7A?si=W0YcpQwORJI0rApq';

// DOM Elements
const videoUrlInput = document.getElementById('videoUrl');
const loadVideoBtn = document.getElementById('loadVideoBtn');
const videoFrame = document.getElementById('videoFrame');
const videoStatus = document.getElementById('videoStatus');
const chatStatus = document.getElementById('chatStatus');
const chatLog = document.getElementById('chatLog');
const askForm = document.getElementById('askForm');
const askBtn = document.getElementById('askBtn');
const questionInput = document.getElementById('questionInput');
const sourceInputSection = document.getElementById('sourceInputSection');
const videoAndChatContainer = document.getElementById('videoAndChatContainer');
const videoLoadInput = document.getElementById('videoLoadInput');
const questionInputContainer = document.getElementById('questionInputContainer');
const recentSearchesList = document.getElementById('recentSearchesList');
const loadVideoFromSidebar = document.getElementById('loadVideoFromSidebar');

// Feature containers & action elements
const notesPlaceholder = document.getElementById('notesPlaceholder');
const notesContainer = document.getElementById('notesContainer');
const generateNotesBtn = document.getElementById('generateNotesBtn');

const quizPlaceholder = document.getElementById('quizPlaceholder');
const quizContainer = document.getElementById('quizContainer');
const generateQuizBtn = document.getElementById('generateQuizBtn');
const quizForm = document.getElementById('quizForm');
const submitQuizBtn = document.getElementById('submitQuizBtn');
const quizResults = document.getElementById('quizResults');

const weakPlaceholder = document.getElementById('weakPlaceholder');
const weakTopicsContainer = document.getElementById('weakTopicsContainer');
const analyzeWeakBtn = document.getElementById('analyzeWeakBtn');

let activeVideoUrl = defaultVideoUrl;
let isReady = false;
let activeNamespace = null;
let currentQuizData = null;
let recentSearches = JSON.parse(localStorage.getItem('visora_recent_searches')) || [];

// Simple safe markdown to HTML parser
function formatMarkdown(text) {
  if (!text) return '';
  let html = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks
  html = html.replace(/```([a-z]*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Headers
  html = html.replace(/^### (.*$)/gim, '<h4 style="margin: 16px 0 8px; color: var(--accent-primary); font-size: 16px;">$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3 style="margin: 18px 0 8px; color: var(--text-main); font-size: 18px;">$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h2 style="margin: 20px 0 10px; color: var(--text-main); font-size: 20px;">$1</h2>');
  // Bold & Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Unordered list items
  html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li style="margin-left: 20px; margin-bottom: 4px;">$1</li>');
  // Ordered list items
  html = html.replace(/^\s*(\d+)\.\s+(.*)$/gim, '<li style="margin-left: 20px; margin-bottom: 4px;">$2</li>');
  // Line breaks
  html = html.replace(/\n\n/g, '<br/><br/>');
  html = html.replace(/\n/g, '<br/>');

  return html;
}

const setChip = (el, text, isError = false) => {
  if (!el) return;
  el.textContent = text;
  if (isError) {
    el.style.background = '#fee2e2';
    el.style.color = '#dc2626';
    el.style.borderColor = '#fca5a5';
  } else {
    el.style.background = '';
    el.style.color = '';
    el.style.borderColor = '';
  }
};

const extractVideoId = (url) => {
  const match = String(url || '').match(/(?:v=|youtu\.be\/)([^&?/]{11})/);
  return match ? match[1] : null;
};

const getYouTubeTitle = async (url) => {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) return null;
    const response = await fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`);
    if (response.ok) {
      const data = await response.json();
      return data.title || null;
    }
  } catch (error) {
    console.log('Could not fetch video title:', error);
  }
  return null;
};

const addMessage = (role, text) => {
  if (!chatLog) return;
  const p = document.createElement('div');
  p.className = `msg ${role}`;
  p.innerHTML = formatMarkdown(text);
  chatLog.appendChild(p);
  chatLog.scrollTop = chatLog.scrollHeight;
};

const addAnimatedMessage = async (role, text) => {
  if (!chatLog) return;
  const p = document.createElement('div');
  p.className = `msg ${role}`;
  p.innerHTML = formatMarkdown(text);
  chatLog.appendChild(p);
  chatLog.scrollTop = chatLog.scrollHeight;
};

const addTypingIndicator = () => {
  if (!chatLog) return;
  const div = document.createElement('div');
  div.className = 'typing-indicator';
  div.id = 'typing-indicator';
  div.innerHTML = '<p class="msg ai"><span>Thinking...</span></p>';
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
};

const removeTypingIndicator = () => {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) indicator.remove();
};

const clearChat = () => {
  if (chatLog) chatLog.innerHTML = '';
};

const addToRecentSearches = async (url) => {
  const videoId = extractVideoId(url);
  if (!videoId) return;

  const title = await getYouTubeTitle(url);
  const videoObj = { url, title: title || videoId };

  recentSearches = recentSearches.filter(item => {
    const itemUrl = typeof item === 'string' ? item : item.url;
    return itemUrl !== url;
  });

  recentSearches = [videoObj, ...recentSearches].slice(0, 10);
  localStorage.setItem('visora_recent_searches', JSON.stringify(recentSearches));
  renderRecentSearches();
};

const renderRecentSearches = () => {
  if (!recentSearchesList) return;
  recentSearchesList.innerHTML = '';
  recentSearches.forEach(item => {
    const url = typeof item === 'string' ? item : item.url;
    const title = typeof item === 'string' ? extractVideoId(item) : item.title;

    const div = document.createElement('div');
    div.className = 'recent-item';
    div.textContent = title;
    div.title = url;
    div.style.padding = '8px 10px';
    div.style.borderRadius = '6px';
    div.style.cursor = 'pointer';
    div.style.fontSize = '12px';
    div.style.border = '1px solid var(--border-light)';
    div.style.whiteSpace = 'nowrap';
    div.style.overflow = 'hidden';
    div.style.textOverflow = 'ellipsis';

    div.addEventListener('click', () => {
      if (videoUrlInput) videoUrlInput.value = url;
      initVideo(url);
    });
    recentSearchesList.appendChild(div);
  });
};

const updateIframe = (url) => {
  const videoId = extractVideoId(url);
  if (!videoId) return false;

  if (videoFrame) {
    videoFrame.src = `https://www.youtube.com/embed/${videoId}`;
  }
  return true;
};

const showVideo = () => {
  if (sourceInputSection) sourceInputSection.style.display = 'none';
  if (videoAndChatContainer) videoAndChatContainer.style.display = 'flex';
  if (videoLoadInput) videoLoadInput.style.display = 'none';
  if (questionInputContainer) questionInputContainer.style.display = 'block';
  clearChat();
};

const initVideo = async (url) => {
  const videoIdOk = updateIframe(url);
  if (!videoIdOk) {
    alert('❌ Invalid YouTube URL. Please paste a valid YouTube video link.');
    setChip(videoStatus, 'Invalid URL', true);
    return;
  }

  setChip(videoStatus, '⏳ Loading transcript...');
  if (loadVideoBtn) loadVideoBtn.disabled = true;
  isReady = false;

  try {
    console.log('📡 Sending init request for:', url);
    const resp = await fetch('/api/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl: url }),
    });

    const data = await resp.json();
    console.log('📥 Response:', data);

    if (!resp.ok || !data.ok) {
      const errorMsg = data.error || 'Failed to load video.';
      console.error('❌ Init failed:', errorMsg);
      throw new Error(errorMsg);
    }

    activeVideoUrl = data.videoUrl;
    activeNamespace = data.namespace || null;
    isReady = true;
    setChip(videoStatus, '✓ Ready');
    showVideo();
    await addToRecentSearches(url);

    // Reset feature containers for new video
    if (notesPlaceholder) notesPlaceholder.style.display = 'block';
    if (notesContainer) { notesContainer.style.display = 'none'; notesContainer.innerHTML = ''; }
    if (quizPlaceholder) quizPlaceholder.style.display = 'block';
    if (quizContainer) { quizContainer.style.display = 'none'; if (quizForm) quizForm.innerHTML = ''; }
    if (weakPlaceholder) weakPlaceholder.style.display = 'block';
    if (weakTopicsContainer) { weakTopicsContainer.style.display = 'none'; weakTopicsContainer.innerHTML = ''; }

    addMessage('ai', '👋 Video loaded successfully! You can ask questions, generate study notes, take a quiz, or view weak topics from the left menu.');
    console.log('✅ Video ready, namespace:', data.namespace);
  } catch (error) {
    isReady = false;
    const msg = error.message || 'Could not load video. Make sure the video has captions available on YouTube.';
    console.error('Error:', msg);
    setChip(videoStatus, '❌ No Captions / Error', true);
    alert(`⚠️ Video Load Issue:\n${msg}`);
  } finally {
    if (loadVideoBtn) loadVideoBtn.disabled = false;
  }
};

// Load video button click handler
if (loadVideoBtn) {
  loadVideoBtn.addEventListener('click', async () => {
    const candidate = videoUrlInput.value.trim() || defaultVideoUrl;
    await initVideo(candidate);
  });
}

// Ask form submission
if (askForm) {
  askForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = questionInput.value.trim();

    if (!query) return;

    if (!isReady) {
      alert('⚠️ Load a video first, then ask your questions.');
      return;
    }

    addMessage('user', query);
    questionInput.value = '';
    questionInput.style.height = 'auto';
    if (askBtn) askBtn.disabled = true;

    addTypingIndicator();

    try {
      console.log('❓ Asking:', query);
      const resp = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: activeVideoUrl, query }),
      });

      const data = await resp.json();
      removeTypingIndicator();

      if (!resp.ok || !data.ok) {
        const errorMsg = data.error || 'Could not generate answer.';
        console.error('Answer failed:', errorMsg);
        throw new Error(errorMsg);
      }

      const answerText = data.answer || 'I could not find an answer in the video.';
      await addAnimatedMessage('ai', answerText);
    } catch (error) {
      removeTypingIndicator();
      const msg = error.message || 'There was a problem getting an answer.';
      console.error('Answer error:', msg);
      addMessage('system', `❌ ${msg}`);
    } finally {
      if (askBtn) askBtn.disabled = false;
    }
  });

  if (questionInput) {
    questionInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        askForm.dispatchEvent(new Event('submit'));
      }
    });

    questionInput.addEventListener('input', () => {
      questionInput.style.height = 'auto';
      const newHeight = Math.min(questionInput.scrollHeight, 200);
      questionInput.style.height = newHeight + 'px';
    });
  }
}

// Sidebar feature buttons & tab switching
document.querySelectorAll('.sidebar-btn[data-feature]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const feature = btn.getAttribute('data-feature');

    // Update active tab buttons
    document.querySelectorAll('.sidebar-btn[data-feature]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Toggle feature containers
    document.querySelectorAll('.feature-container').forEach(c => {
      c.style.display = 'none';
    });

    const target = document.getElementById(`feature-${feature}`);
    if (target) {
      target.style.display = 'flex';
      target.style.flexDirection = 'column';
    }
  });
});

// Clear recent searches
const clearRecentBtn = document.getElementById('clearRecentBtn');
if (clearRecentBtn) {
  clearRecentBtn.addEventListener('click', () => {
    localStorage.removeItem('visora_recent_searches');
    recentSearches = [];
    renderRecentSearches();
    clearRecentBtn.textContent = 'Cleared';
    setTimeout(() => {
      clearRecentBtn.textContent = 'Clear';
    }, 1500);
  });
}

// Sidebar "Load Source" button
if (loadVideoFromSidebar) {
  loadVideoFromSidebar.addEventListener('click', () => {
    // Switch to doubt solver tab to see input
    const doubtBtn = document.querySelector('.sidebar-btn[data-feature="doubt"]');
    if (doubtBtn) doubtBtn.click();
    if (videoLoadInput) {
      videoLoadInput.style.display = 'flex';
      if (videoUrlInput) videoUrlInput.focus();
    }
  });
}

// Generate Notes Button Handler
if (generateNotesBtn) {
  generateNotesBtn.addEventListener('click', async () => {
    if (!isReady) {
      alert('Please load a video first in the AI Doubt Solver tab.');
      return;
    }

    generateNotesBtn.disabled = true;
    generateNotesBtn.textContent = '⏳ Generating Notes...';

    try {
      const resp = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: activeVideoUrl }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || 'Failed to generate notes.');
      }

      if (notesPlaceholder) notesPlaceholder.style.display = 'none';
      if (notesContainer) {
        notesContainer.style.display = 'block';
        notesContainer.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-light); padding-bottom: 12px;">
            <h3 style="margin: 0; font-size: 20px;">📝 Generated Study Notes</h3>
            <button id="regenerateNotesBtn" class="action-btn" style="padding: 6px 14px; font-size: 13px; border-radius: 6px; background: var(--bg-surface-elevated); color: var(--text-main); border: 1px solid var(--border-light); cursor: pointer;">Regenerate</button>
          </div>
          <div class="notes-content" style="background: var(--bg-surface); padding: 24px; border-radius: 12px; border: 1px solid var(--border-light);">
            ${formatMarkdown(data.notes)}
          </div>
        `;

        document.getElementById('regenerateNotesBtn')?.addEventListener('click', () => {
          generateNotesBtn.click();
        });
      }
    } catch (error) {
      alert(`Error generating notes: ${error.message}`);
    } finally {
      generateNotesBtn.disabled = false;
      generateNotesBtn.textContent = 'Generate Notes';
    }
  });
}

// Generate Quiz Button Handler
if (generateQuizBtn) {
  generateQuizBtn.addEventListener('click', async () => {
    if (!isReady) {
      alert('Please load a video first in the AI Doubt Solver tab.');
      return;
    }

    generateQuizBtn.disabled = true;
    generateQuizBtn.textContent = '⏳ Generating Quiz...';

    try {
      const resp = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: activeVideoUrl }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok || !Array.isArray(data.quiz)) {
        throw new Error(data.error || 'Failed to generate quiz questions.');
      }

      currentQuizData = data.quiz;

      if (quizPlaceholder) quizPlaceholder.style.display = 'none';
      if (quizContainer) quizContainer.style.display = 'block';
      if (quizResults) quizResults.innerHTML = '';
      if (submitQuizBtn) {
        submitQuizBtn.style.display = 'block';
        submitQuizBtn.disabled = false;
      }

      if (quizForm) {
        quizForm.innerHTML = currentQuizData.map((q, qIndex) => `
          <div class="quiz-question-card" style="background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: 12px; padding: 20px;">
            <p style="font-weight: 600; margin: 0 0 14px 0; font-size: 15px;">${qIndex + 1}. ${formatMarkdown(q.question)}</p>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${q.options.map((opt, optIndex) => `
                <label style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                  <input type="radio" name="question_${qIndex}" value="${optIndex}" style="accent-color: var(--accent-primary);" required />
                  <span style="font-size: 14px;">${opt}</span>
                </label>
              `).join('')}
            </div>
            <div class="explanation-box" id="explanation_${qIndex}" style="display: none; margin-top: 12px; padding: 10px 14px; border-radius: 6px; font-size: 13px;"></div>
          </div>
        `).join('');
      }
    } catch (error) {
      alert(`Error generating quiz: ${error.message}`);
    } finally {
      generateQuizBtn.disabled = false;
      generateQuizBtn.textContent = 'Start Quiz';
    }
  });
}

// Submit Quiz Button Handler
if (submitQuizBtn) {
  submitQuizBtn.addEventListener('click', async () => {
    if (!currentQuizData || currentQuizData.length === 0) return;

    let score = 0;
    const total = currentQuizData.length;
    const missed = [];

    currentQuizData.forEach((q, qIndex) => {
      const selected = document.querySelector(`input[name="question_${qIndex}"]:checked`);
      const explanationBox = document.getElementById(`explanation_${qIndex}`);
      const selectedIndex = selected ? parseInt(selected.value, 10) : -1;

      if (explanationBox) {
        explanationBox.style.display = 'block';
      }

      if (selectedIndex === q.answerIndex) {
        score++;
        if (explanationBox) {
          explanationBox.style.background = '#dcfce7';
          explanationBox.style.color = '#166534';
          explanationBox.innerHTML = `<strong>✓ Correct!</strong> ${q.explanation || ''}`;
        }
      } else {
        missed.push(q.question);
        if (explanationBox) {
          explanationBox.style.background = '#fee2e2';
          explanationBox.style.color = '#991b1b';
          explanationBox.innerHTML = `<strong>✗ Incorrect.</strong> Correct answer: <em>${q.options[q.answerIndex]}</em>. ${q.explanation || ''}`;
        }
      }
    });

    submitQuizBtn.disabled = true;
    if (quizResults) {
      const percent = Math.round((score / total) * 100);
      quizResults.innerHTML = `
        <div style="background: var(--bg-surface-elevated); padding: 16px; border-radius: 8px; border: 1px solid var(--border-light); text-align: center;">
          <h3 style="margin: 0 0 6px 0; font-size: 20px;">Score: ${score} / ${total} (${percent}%)</h3>
          <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">${percent >= 80 ? '🎉 Excellent mastery of this material!' : '💡 Review the explanations or check your Weak Topics tab.'}</p>
        </div>
      `;
    }

    // Submit score to backend for weak topic tracking
    try {
      await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: activeVideoUrl,
          score,
          total,
          missed,
        }),
      });
    } catch (e) {
      console.error('Failed to submit score:', e);
    }
  });
}

// Analyze Weak Topics Button Handler
if (analyzeWeakBtn) {
  analyzeWeakBtn.addEventListener('click', async () => {
    if (!isReady) {
      alert('Please load a video first in the AI Doubt Solver tab.');
      return;
    }

    analyzeWeakBtn.disabled = true;
    analyzeWeakBtn.textContent = '⏳ Analyzing...';

    try {
      const resp = await fetch('/api/weak-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: activeVideoUrl }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || 'Failed to analyze weak topics.');
      }

      if (weakPlaceholder) weakPlaceholder.style.display = 'none';
      if (weakTopicsContainer) {
        weakTopicsContainer.style.display = 'block';
        weakTopicsContainer.innerHTML = `
          <div style="background: var(--bg-surface); padding: 24px; border-radius: 12px; border: 1px solid var(--border-light);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--border-light); padding-bottom: 10px;">
              <h3 style="margin: 0; font-size: 18px;">🎯 Target Areas for Revision</h3>
              <button id="reanalyzeWeakBtn" class="action-btn" style="padding: 6px 14px; font-size: 13px; border-radius: 6px; background: var(--bg-surface-elevated); color: var(--text-main); border: 1px solid var(--border-light); cursor: pointer;">Re-analyze</button>
            </div>
            <div style="line-height: 1.7;">
              ${formatMarkdown(data.weakTopics)}
            </div>
          </div>
        `;

        document.getElementById('reanalyzeWeakBtn')?.addEventListener('click', () => {
          analyzeWeakBtn.click();
        });
      }
    } catch (error) {
      alert(`Error analyzing weak topics: ${error.message}`);
    } finally {
      analyzeWeakBtn.disabled = false;
      analyzeWeakBtn.textContent = 'Analyze Weak Topics';
    }
  });
}

// Initialize recent searches on page load
renderRecentSearches();

