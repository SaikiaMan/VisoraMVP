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
const videoContainer = document.getElementById('videoContainer');
const videoLoadInput = document.getElementById('videoLoadInput');
const questionInputContainer = document.getElementById('questionInputContainer');
const recentSearchesList = document.getElementById('recentSearchesList');

// If we're not on the learn page, these elements won't exist
if (!loadVideoBtn || !videoUrlInput || !askForm) {
  console.log('⚠️ app.js: Learning workspace elements not found. This script is for /learn.html');
}

let activeVideoUrl = defaultVideoUrl;
let isReady = false;
let activeNamespace = null;
let recentSearches = JSON.parse(localStorage.getItem('visora_recent_searches')) || [];

const setChip = (el, text) => {
  if (el) el.textContent = text;
};

const addMessage = (role, text) => {
  if (!chatLog) return;
  const p = document.createElement('p');
  p.className = `msg ${role}`;
  p.textContent = text;
  chatLog.appendChild(p);
  chatLog.scrollTop = chatLog.scrollHeight;
};

const addAnimatedMessage = async (role, text) => {
  if (!chatLog) return;
  const p = document.createElement('p');
  p.className = `msg ${role} streaming`;
  p.textContent = '';
  chatLog.appendChild(p);
  
  // Stream text character by character with animation
  let charIndex = 0;
  const streamChar = () => {
    if (charIndex < text.length) {
      p.textContent += text[charIndex];
      charIndex++;
      chatLog.scrollTop = chatLog.scrollHeight;
      // Vary the speed slightly for natural feel
      const delay = Math.random() * 20 + 10; // 10-30ms per character
      setTimeout(streamChar, delay);
    } else {
      // Remove streaming class when done
      p.classList.remove('streaming');
    }
  };
  
  streamChar();
};

const addTypingIndicator = () => {
  if (!chatLog) return;
  const div = document.createElement('div');
  div.className = 'typing-indicator';
  div.id = 'typing-indicator';
  div.innerHTML = '<p class="msg ai"><span></span><span></span><span></span></p>';
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

const addToRecentSearches = (url) => {
  const videoId = extractVideoId(url);
  if (!videoId) return;
  
  // Add to recent searches (max 10)
  recentSearches = [url, ...recentSearches.filter(u => u !== url)].slice(0, 10);
  localStorage.setItem('visora_recent_searches', JSON.stringify(recentSearches));
  renderRecentSearches();
};

const renderRecentSearches = () => {
  if (!recentSearchesList) return;
  recentSearchesList.innerHTML = '';
  recentSearches.forEach(url => {
    const item = document.createElement('div');
    item.className = 'recent-item';
    item.textContent = `📹 ${extractVideoId(url)}`;
    item.title = url;
    item.addEventListener('click', () => {
      videoUrlInput.value = url;
      loadVideoBtn.click();
    });
    recentSearchesList.appendChild(item);
  });
};

const extractVideoId = (url) => {
  const match = String(url || '').match(/(?:v=|youtu\.be\/)([^&?/]{11})/);
  return match ? match[1] : null;
};

const updateIframe = (url) => {
  const videoId = extractVideoId(url);
  if (!videoId) {
    return false;
  }

  if (videoFrame) {
    videoFrame.src = `https://www.youtube.com/embed/${videoId}`;
  }
  return true;
};

const showVideo = () => {
  if (sourceInputSection) sourceInputSection.style.display = 'none';
  const videoAndChatContainer = document.getElementById('videoAndChatContainer');
  if (videoAndChatContainer) videoAndChatContainer.style.display = 'flex';
  if (videoLoadInput) videoLoadInput.style.display = 'none';
  if (questionInputContainer) questionInputContainer.style.display = 'block';
  clearChat(); // Clear previous messages
};

const initVideo = async (url) => {
  const previousNamespace = activeNamespace;
  const videoIdOk = updateIframe(url);
  if (!videoIdOk) {
    alert('❌ Invalid YouTube URL. Please try again.');
    setChip(videoStatus, 'Invalid URL');
    return;
  }

  setChip(videoStatus, '⏳ Loading...');
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
    addToRecentSearches(url);

    console.log('✅ Video ready, namespace:', data.namespace);
  } catch (error) {
    isReady = false;
    const msg = error.message || 'Could not load video. Check the URL and ensure it has captions.';
    console.error('Error:', msg);
    setChip(videoStatus, '❌ Error');
    alert(msg);
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

    if (!query) {
      return;
    }

    if (!isReady) {
      alert('⚠️ Load a video with captions first, then ask your questions.');
      return;
    }

    addMessage('user', query);
    questionInput.value = '';
    questionInput.style.height = 'auto';
    if (askBtn) askBtn.disabled = true;
    
    // Show typing indicator
    addTypingIndicator();

    try {
      console.log('❓ Asking:', query);
      const resp = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: activeVideoUrl, query }),
      });

      const data = await resp.json();
      console.log('📥 Answer response:', data);
      
      removeTypingIndicator();
      
      if (!resp.ok || !data.ok) {
        const errorMsg = data.error || 'Could not generate answer.';
        console.error('Answer failed:', errorMsg);
        throw new Error(errorMsg);
      }

      const answerText = data.answer || 'I could not find an answer.';
      await addAnimatedMessage('ai', answerText);
      console.log(`✓ Answer generated using ${data.chunkCount} chunks in namespace ${data.namespace}`);
    } catch (error) {
      removeTypingIndicator();
      const msg = error.message || 'There was a problem getting an answer.';
      console.error('Answer error:', msg);
      addMessage('system', `❌ ${msg}`);
    } finally {
      if (askBtn) askBtn.disabled = false;
    }
  });

  // Handle Enter key to submit (Shift+Enter for newline)
  if (questionInput) {
    questionInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        askForm.dispatchEvent(new Event('submit'));
      }
    });

    // Auto-expand textarea as user types
    questionInput.addEventListener('input', () => {
      questionInput.style.height = 'auto';
      const newHeight = Math.min(questionInput.scrollHeight, 200);
      questionInput.style.height = newHeight + 'px';
    });
  }
}

// Sidebar feature buttons
document.querySelectorAll('[data-feature]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const feature = btn.dataset.feature;
    
    if (!isReady) {
      alert('Please load a video first');
      return;
    }

    if (feature === 'doubt') {
      alert('Use the search bar below to ask questions');
    } else if (feature === 'notes') {
      alert('Notes generator feature coming soon');
    } else if (feature === 'quiz') {
      alert('Quiz feature coming soon');
    } else if (feature === 'weak') {
      alert('Weak topics detection coming soon');
    }
  });
});

// Load video from sidebar
const loadVideoFromSidebar = document.getElementById('loadVideoFromSidebar');
if (loadVideoFromSidebar) {
  loadVideoFromSidebar.addEventListener('click', () => {
    if (videoLoadInput) {
      videoLoadInput.style.display = 'flex';
      if (videoUrlInput) videoUrlInput.focus();
    }
  });
}

// Initialize recent searches
renderRecentSearches();
