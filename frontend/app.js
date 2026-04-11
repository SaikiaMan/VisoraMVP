const defaultVideoUrl = 'https://youtu.be/dAF5FngVa7A?si=W0YcpQwORJI0rApq';

const videoUrlInput = document.getElementById('videoUrl');
const loadVideoBtn = document.getElementById('loadVideoBtn');
const videoFrame = document.getElementById('videoFrame');
const videoStatus = document.getElementById('videoStatus');
const chatStatus = document.getElementById('chatStatus');
const chatLog = document.getElementById('chatLog');
const askForm = document.getElementById('askForm');
const askBtn = document.getElementById('askBtn');
const questionInput = document.getElementById('questionInput');
const startLearningButtons = document.querySelectorAll('[data-start-learning]');
const learningWorkspace = document.getElementById('learningWorkspace');

let activeVideoUrl = defaultVideoUrl;
let isReady = false;
let activeNamespace = null;

const setChip = (el, text) => {
  el.textContent = text;
};

const addMessage = (role, text) => {
  const p = document.createElement('p');
  p.className = `msg ${role}`;
  p.textContent = text;
  chatLog.appendChild(p);
  chatLog.scrollTop = chatLog.scrollHeight;
};

const clearChat = () => {
  chatLog.innerHTML = '';
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

  videoFrame.src = `https://www.youtube.com/embed/${videoId}`;
  return true;
};

const initVideo = async (url) => {
  const previousNamespace = activeNamespace;
  const videoIdOk = updateIframe(url);
  if (!videoIdOk) {
    addMessage('system', '❌ Invalid YouTube URL. Please try again.');
    setChip(videoStatus, 'Invalid URL');
    setChip(chatStatus, 'Blocked');
    return;
  }

  setChip(videoStatus, '⏳ Loading...');
  setChip(chatStatus, '⏳ Preparing...');
  loadVideoBtn.disabled = true;
  askBtn.disabled = true;
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
    setChip(chatStatus, '✓ Ask away');

    if (previousNamespace && activeNamespace && previousNamespace !== activeNamespace) {
      clearChat();
      addMessage('system', `✅ Switched to new video (${activeNamespace}). Ask questions for this video only.`);
    } else {
      addMessage('system', `✅ Video loaded (${activeNamespace || 'unknown'}). Start asking your questions.`);
    }

    console.log('✅ Video ready, namespace:', data.namespace);
  } catch (error) {
    isReady = false;
    const msg = error.message || 'Could not load video. Check the URL and ensure it has captions.';
    console.error('Error:', msg);
    setChip(videoStatus, '❌ Error');
    setChip(chatStatus, '❌ Failed');
    addMessage('system', msg);
  } finally {
    loadVideoBtn.disabled = false;
    askBtn.disabled = false;
  }
};

loadVideoBtn.addEventListener('click', async () => {
  const candidate = videoUrlInput.value.trim() || defaultVideoUrl;
  
  // Transition UI: Hide center input, show active Notebook Workspace
  if (sourceInputSection && mainWorkspace) {
    sourceInputSection.style.display = 'none';
    mainWorkspace.style.display = 'grid';
  }

  await initVideo(candidate);
});

askForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = questionInput.value.trim();

  if (!query) {
    return;
  }

  if (!isReady) {
    addMessage('system', '⚠️ Load a video with captions first, then ask your questions.');
    return;
  }

  addMessage('user', query);
  questionInput.value = '';
  askBtn.disabled = true;
  setChip(chatStatus, '🤔 Thinking...');

  try {
    console.log('❓ Asking:', query);
    const resp = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl: activeVideoUrl, query }),
    });

    const data = await resp.json();
    console.log('📥 Answer response:', data);
    
    if (!resp.ok || !data.ok) {
      const errorMsg = data.error || 'Could not generate answer.';
      console.error('Answer failed:', errorMsg);
      throw new Error(errorMsg);
    }

    const answerText = data.answer || 'I could not find an answer.';
    const details = data.namespace
      ? `\n\n[Video: ${data.namespace} | Chunks: ${data.chunkCount ?? 0}]`
      : '';
    addMessage('ai', `${answerText}${details}`);
    console.log(`✓ Answer generated using ${data.chunkCount} chunks in namespace ${data.namespace}`);
    setChip(chatStatus, '✓ Ready');
  } catch (error) {
    const msg = error.message || 'There was a problem getting an answer.';
    console.error('Answer error:', msg);
    addMessage('system', `❌ ${msg}`);
    setChip(chatStatus, '❌ Retry');
  } finally {
    askBtn.disabled = false;
  }
});

startLearningButtons.forEach((button) => {
  button.addEventListener('click', () => {
    learningWorkspace?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      if (sourceInputSection && sourceInputSection.style.display !== 'none') {
        videoUrlInput?.focus({ preventScroll: true });
      } else {
        questionInput?.focus({ preventScroll: true });
      }
    }, 450);
  });
});
  // videoUrlInput.value = defaultVideoUrl;
  // initVideo(defaultVideoUrl);

  // NotebookLM Layout switching and Tabs logic
  const sourceInputSection = document.getElementById('sourceInputSection');     
  const mainWorkspace = document.getElementById('mainWorkspace');

  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Deactivate all
      tabBtns.forEach(b => {
         b.classList.remove('active');
         b.style.background = 'transparent';
         b.style.border = '1px solid transparent';
         b.style.color = 'var(--text-secondary)';
      });
      tabContents.forEach(content => content.style.display = 'none');

      // Activate clicked
      btn.classList.add('active');
      btn.style.background = 'var(--surface-light)';
      btn.style.border = '1px solid rgba(255,255,255,0.1)';
      btn.style.color = 'white';

      // Show content
      const targetId = 'tab-' + btn.getAttribute('data-tab');
      const contentEl = document.getElementById(targetId);
      if(contentEl) {
        contentEl.style.display = 'flex';
      }
    });
  });

  // Philosophy Section GSAP Animation
document.addEventListener('DOMContentLoaded', () => {
  const philSection = document.querySelector('.philosophy-section');
  if (!philSection || typeof gsap === 'undefined') return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const tl = gsap.timeline();
        
        tl.fromTo('.phil-label', 
          { opacity: 0, y: -24 },
          { opacity: 1, y: 0, duration: 0.7, ease: "power2.out", delay: 0.1 }
        );

        tl.fromTo('.phil-quote',
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: 0.9, ease: "power2.out" },
          0.3 // relative absolute frame in GSAP
        );

        tl.to('.phil-underline', 
          { width: "100%", duration: 0.7, ease: "power2.out", stagger: 0.15 },
          1.2
        );

        tl.fromTo('.phil-divider',
          { opacity: 0, scaleY: 0 },
          { opacity: 1, scaleY: 1, duration: 0.7, ease: "power2.out", transformOrigin: "top" },
          1.2
        );

        tl.fromTo('.phil-subtext',
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" },
          1.5
        );

        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  observer.observe(philSection);
});

// Epoch Section GSAP Animation
document.addEventListener('DOMContentLoaded', () => {
  const epochSection = document.querySelector('.epoch-section');
  if (!epochSection || typeof gsap === 'undefined') return;

  const epochObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const tl = gsap.timeline();
        
        // Left Card Animations
        tl.fromTo('.epoch-card-title', 
          { opacity: 0, y: 40 },
          { opacity: 1, y: 0, duration: 1.2, ease: "power3.out" }
        );
        tl.fromTo('.epoch-card-sub',
          { opacity: 0 },
          { opacity: 1, duration: 0.8 },
          0.6
        );
        tl.fromTo('.epoch-cta-wrapper',
          { opacity: 0, scale: 0.92 },
          { opacity: 1, scale: 1, duration: 0.5 },
          1.1
        );
        tl.fromTo('.epoch-illustration',
          { opacity: 0, scale: 0.85 },
          { opacity: 1, scale: 1, duration: 1, ease: "power2.out" },
          1.3
        );
        tl.fromTo('.epoch-icon-row',
          { opacity: 0 },
          { opacity: 1, duration: 0.6 },
          1.7
        );

        // Right Info Animations
        tl.fromTo('.epoch-info-title',
          { opacity: 0, x: 60 },
          { opacity: 1, x: 0, duration: 1.2, ease: "power3.out" },
          0.2
        );
        tl.fromTo('.epoch-info-sub',
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 1 },
          0.6
        );
        tl.fromTo('.epoch-stat',
          { opacity: 0, scale: 0.9 },
          { opacity: 1, scale: 1, duration: 0.7, ease: "power2.out", stagger: 0.15 },
          0.9
        );

        epochObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });

  epochObserver.observe(epochSection);
});

// Coded Hero Background Animations
document.addEventListener('DOMContentLoaded', () => {
  const star3d = document.querySelector('.star-3d');
  const sphere = document.querySelector('.purple-sphere');
  const hands = document.querySelectorAll('.pix-hand');

  // GSAP 3D Scroll Rotation for Star
  if (star3d) {
    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      // Map scroll to 3D rotation values
      star3d.style.transform = `rotateY(${scrollY * 0.15}deg) rotateX(${scrollY * 0.05}deg)`;
    });
  }

  // GSAP Floating Sphere Animation
  if (sphere && typeof gsap !== 'undefined') {
    gsap.to(sphere, {
      y: -20,
      duration: 2,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1
    });
  }
  
  // Fade and Slide Hands on Load
  if (hands.length === 2 && typeof gsap !== 'undefined') {
    gsap.fromTo(hands[0], 
      { x: -50, opacity: 0 }, 
      { x: 0, opacity: 0.8, duration: 1.5, ease: "power2.out", delay: 0.2 }
    );
    gsap.fromTo(hands[1], 
      { x: 50, opacity: 0 }, 
      { x: 0, opacity: 0.8, duration: 1.5, ease: "power2.out", delay: 0.2 }
    );
  }
})


// Notes Generator Logic
const generateNotesBtn = document.getElementById('generateNotesBtn');
const notesContainer = document.getElementById('notesContainer');
const notesPlaceholder = document.getElementById('notesPlaceholder');

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

      let text = (data.notes || '');
      // Markdown Parsing
      text = text.replace(/^# (.*$)/gim, '<h2 style="margin-top:20px; font-weight: bold;">$1</h2>');
      text = text.replace(/^## (.*$)/gim, '<h3 style="margin-top:16px; font-weight: bold;">$1</h3>');
      text = text.replace(/^### (.*$)/gim, '<h4 style="margin-top:12px; font-weight: bold;">$1</h4>');
      text = text.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
      text = text.replace(/\n\n/g, '<br/><br/>');
      text = text.replace(/\n/g, '<br/>');

      if (notesPlaceholder) notesPlaceholder.style.display = 'none';
      if (notesContainer) {
        notesContainer.style.display = 'block';
        notesContainer.innerHTML = text;
      }

    } catch(err) {
      alert('Error generating notes: ' + err.message);
    }
    generateNotesBtn.disabled = false;
    generateNotesBtn.textContent = 'Generate Notes';
  });
}

// Quiz and Weak Topics Logic
const generateQuizBtn = document.getElementById('generateQuizBtn');
const quizContainer = document.getElementById('quizContainer');
const quizForm = document.getElementById('quizForm');
const submitQuizBtn = document.getElementById('submitQuizBtn');
const quizResults = document.getElementById('quizResults');

const analyzeWeakBtn = document.getElementById('analyzeWeakbtn');
const weakTopicsContainer = document.getElementById('weakTopicsContainer');
const weakPlaceholderIcon = document.getElementById('weakPlaceholderIcon');
const weakPlaceholderTitle = document.getElementById('weakPlaceholderTitle');
const weakPlaceholderDesc = document.getElementById('weakPlaceholderDesc');

let currentQuizData = null;

if (generateQuizBtn) {
  generateQuizBtn.addEventListener('click', async () => {
    if (!activeVideoUrl || !isReady) {
      alert('Please load a video first!');
      return;
    }

    generateQuizBtn.disabled = true;
    generateQuizBtn.textContent = 'Generating...';

    try {
      const resp = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: activeVideoUrl })
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok) throw new Error(data.error);

      currentQuizData = data.quiz;
      renderQuiz(currentQuizData);
    } catch(err) {
      alert('Error generating quiz: ' + err.message);
    }

    generateQuizBtn.disabled = false;
    generateQuizBtn.style.display = 'none';
    generateQuizBtn.textContent = 'Generate Another Quiz';
  });
}

function renderQuiz(quiz) {
  quizContainer.style.display = 'block';
  quizForm.innerHTML = '';
  quizResults.innerHTML = '';
  submitQuizBtn.style.display = 'inline-block';

  quiz.forEach((q, index) => {
    const qDiv = document.createElement('div');
    qDiv.style.marginBottom = '20px';
    
    const title = document.createElement('p');
    title.innerHTML = '<strong>' + (index + 1) + '. ' + q.question + '</strong>';
    qDiv.appendChild(title);

    q.options.forEach((opt, optIndex) => {
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.marginBottom = '8px';
      label.style.cursor = 'pointer';
      
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'q' + index;
      input.value = optIndex;
      input.style.marginRight = '8px';

      label.appendChild(input);
      label.appendChild(document.createTextNode(opt));
      qDiv.appendChild(label);
    });

    const explanation = document.createElement('div');
    explanation.id = 'expl_' + index;
    explanation.style.display = 'none';
    explanation.style.fontSize = '0.9em';
    explanation.style.color = '#ddd';
    explanation.style.marginTop = '8px';
    explanation.style.padding = '8px 12px';
    explanation.style.backgroundColor = 'rgba(255,255,255,0.05)';
    explanation.style.borderRadius = '4px';
    explanation.innerHTML = '<i>' + q.explanation + '</i>';
    qDiv.appendChild(explanation);

    quizForm.appendChild(qDiv);
  });
}

if (submitQuizBtn) {
  submitQuizBtn.addEventListener('click', async () => {
    if (!currentQuizData) return;

    let score = 0;
    let missedDetails = [];
    const formData = new FormData(quizForm);

    currentQuizData.forEach((q, index) => {
      const selected = formData.get('q' + index);
      const explNode = document.getElementById('expl_' + index);

      if (selected !== null && parseInt(selected) === q.answerIndex) {
        score++;
        explNode.style.borderLeft = '4px solid #4CAF50';
      } else {
        missedDetails.push(q.question);
        explNode.style.borderLeft = '4px solid #F44336';
      }
      
      explNode.style.display = 'block';
    });

    submitQuizBtn.style.display = 'none';
    generateQuizBtn.style.display = 'inline-block';
    generateQuizBtn.textContent = 'Generate Next Quiz';

    quizResults.textContent = 'You scored ' + score + ' out of ' + currentQuizData.length + '!';

    if (activeVideoUrl) {
      try {
        await fetch('/api/quiz/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: activeVideoUrl, score, total: currentQuizData.length, missed: missedDetails })
        });
      } catch (err) {
        console.error('Could not submit quiz score:', err);
      }
    }
  });
}

if (analyzeWeakBtn) {
  analyzeWeakBtn.addEventListener('click', async () => {
    if (!activeVideoUrl || !isReady) {
      alert('Please load a video first!');
      return;
    }

    analyzeWeakBtn.disabled = true;
    analyzeWeakBtn.textContent = 'Analyzing...';

    try {
      const resp = await fetch('/api/weak-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: activeVideoUrl })
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok) throw new Error(data.error);

      let text = (data.weakTopics || '');
      text = text.replace(/^# (.*$)/gim, '<h2 style="margin-top:16px; font-weight: bold;">$1</h2>');
      text = text.replace(/^## (.*$)/gim, '<h3 style="margin-top:12px; font-weight: bold;">$1</h3>');
      text = text.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
      text = text.replace(/\n\n/g, '<br/><br/>');
      text = text.replace(/\n/g, '<br/>');

      weakPlaceholderIcon.style.display = 'none';
      weakPlaceholderTitle.style.display = 'none';
      weakPlaceholderDesc.style.display = 'none';
      
      weakTopicsContainer.style.display = 'block';
      weakTopicsContainer.innerHTML = text;

    } catch(err) {
      alert('Error analyzing weak topics: ' + err.message);
    }

    analyzeWeakBtn.disabled = false;
    analyzeWeakBtn.textContent = 'Refresh Weak Topics';
  });
}
