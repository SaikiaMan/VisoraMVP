const fs = require('fs');

const uiHtml = `
      <section id="learningWorkspace" class="workspace-section">
        
        <!-- INITIAL SOURCE INPUT -->
        <div id="sourceInputSection" class="workspace-header glass-panel" style="margin: 0 auto; max-width: 600px; text-align: center; padding: 60px 40px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
            <div class="panel-title" style="justify-content: center; margin-bottom: 20px;">
                <span class="material-symbols-outlined title-icon" style="font-size: 40px; color: var(--accent-primary);">book_4</span>
                <h3 style="font-size: 32px; margin: 0;">New AI Notebook</h3>
            </div>
            <p style="margin-bottom: 32px; color: var(--text-secondary); font-size: 18px;">Paste a YouTube link below to initialize your workspace.</p>
            
            <div class="input-group" style="margin-bottom: 0;">
                <span class="material-symbols-outlined input-icon">link</span>  
                <input id="videoUrl" type="url" placeholder="Paste YouTube link here..." style="font-size: 16px; padding: 16px 16px 16px 44px; border-radius: 8px;" />
                <button id="loadVideoBtn" type="button" class="action-btn" style="padding: 12px 32px; font-size: 16px;">Load Source</button>
            </div>
        </div>

        <!-- LOADED WORKSPACE -->
        <div class="workspace-grid" id="mainWorkspace" style="display: none;">
          <!-- Video Panel -->
          <article class="panel video-panel glass-panel" style="display: flex; flex-direction: column;">
            <div class="panel-top" style="margin-bottom: 16px;">
              <div class="panel-title">
                  <span class="material-symbols-outlined title-icon">smart_display</span>
                  <h3>Source Video</h3>
              </div>
              <span id="videoStatus" class="status-chip">Ready</span>
            </div>

            <div class="video-container" style="flex: 1; min-height: 400px; border-radius: 8px; overflow: hidden;">
              <iframe
                id="videoFrame"
                title="Lesson Video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen
                style="width: 100%; height: 100%; border: none;"
              ></iframe>
            </div>
          </article>

          <!-- Notebook Studio Panel -->
          <aside class="panel chat-panel glass-panel" style="display: flex; flex-direction: column;">
            <div class="panel-top" style="margin-bottom: 16px;">
                <div class="panel-title">
                    <span class="material-symbols-outlined title-icon">neurology</span>
                    <h3>Notebook Studio</h3>
                </div>
                <span id="chatStatus" class="status-chip pulse">Online</span>
            </div>

            <!-- Tabs -->
            <div class="feature-tabs" style="display: flex; gap: 8px; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); overflow-x: auto; scrollbar-width: none;">
              <button class="tab-btn active" data-tab="doubt" style="background: var(--surface-light); border: 1px solid rgba(255,255,255,0.1); padding: 8px 16px; border-radius: 20px; color: white; cursor: pointer; white-space: nowrap; outline: none;">AI Doubt Solver</button>
              <button class="tab-btn" data-tab="notes" style="background: transparent; border: 1px solid transparent; padding: 8px 16px; border-radius: 20px; color: var(--text-secondary); cursor: pointer; white-space: nowrap; transition: 0.2s; outline: none;">Notes Generator</button>
              <button class="tab-btn" data-tab="quiz" style="background: transparent; border: 1px solid transparent; padding: 8px 16px; border-radius: 20px; color: var(--text-secondary); cursor: pointer; white-space: nowrap; transition: 0.2s; outline: none;">AI Quiz</button>
              <button class="tab-btn" data-tab="weak" style="background: transparent; border: 1px solid transparent; padding: 8px 16px; border-radius: 20px; color: var(--text-secondary); cursor: pointer; white-space: nowrap; transition: 0.2s; outline: none;">Weak Topics</button>
            </div>

            <!-- Tab Content: Doubt Solver -->
            <div id="tab-doubt" class="tab-content" style="display: flex; flex-direction: column; flex: 1;">
              <div id="chatLog" class="chat-log" aria-live="polite" style="flex: 1; min-height: 300px; max-height: 400px; overflow-y: auto;">
                  <!-- Messages will appear here -->
              </div>
              <form id="askForm" class="ask-form relative" style="margin-top: 16px;">
                <textarea id="questionInput" rows="2" placeholder="Ask anything about the video..." required></textarea>
                <button id="askBtn" type="submit" class="send-btn">
                    <span class="material-symbols-outlined">send</span>
                </button>
              </form>
            </div>

            <!-- Tab Content: Notes -->
            <div id="tab-notes" class="tab-content" style="display: none; align-items: center; justify-content: center; flex: 1; text-align: center; flex-direction: column; min-height: 300px;">
               <span class="material-symbols-outlined icon" style="font-size: 48px; color: var(--text-muted); margin-bottom: 16px;">auto_awesome</span>
               <h3 style="margin-bottom: 8px;">Auto-generated Notes</h3>
               <p style="color: var(--text-secondary); margin-bottom: 24px; max-width: 80%;">Generate detailed, structured study notes directly from this video.</p>
               <button class="action-btn" onclick="alert('Notes Generator feature coming soon!')">Generate Notes</button>
            </div>

            <!-- Tab Content: Quiz -->
            <div id="tab-quiz" class="tab-content" style="display: none; align-items: center; justify-content: center; flex: 1; text-align: center; flex-direction: column; min-height: 300px;">
               <span class="material-symbols-outlined icon" style="font-size: 48px; color: var(--text-muted); margin-bottom: 16px;">quiz</span>
               <h3 style="margin-bottom: 8px;">AI Quiz Generator</h3>
               <p style="color: var(--text-secondary); margin-bottom: 24px; max-width: 80%;">Test your knowledge on the core concepts covered so far.</p>
               <button class="action-btn" onclick="alert('Quiz Generator feature coming soon!')">Start Quiz</button>
            </div>

            <!-- Tab Content: Weak Topics -->
            <div id="tab-weak" class="tab-content" style="display: none; align-items: center; justify-content: center; flex: 1; text-align: center; flex-direction: column; min-height: 300px;">
               <span class="material-symbols-outlined icon" style="font-size: 48px; color: var(--text-muted); margin-bottom: 16px;">troubleshoot</span>
               <h3 style="margin-bottom: 8px;">Weak Topic Detection</h3>
               <p style="color: var(--text-secondary); margin-bottom: 24px; max-width: 80%;">Analyze your interactions to discover areas that need more focus.</p>
               <button class="action-btn" onclick="alert('Weak Topic Detection feature coming soon!')">Analyze Weak Topics</button>
            </div>
          </aside>
        </div>
      </section>
`;

let html = fs.readFileSync('frontend/index.html', 'utf8');

const sIdx = html.indexOf('<section id="learningWorkspace"');
const parts = html.split('<section class="philosophy-section">');
if (sIdx !== -1 && parts.length > 1) {
  html = html.substring(0, sIdx) + uiHtml + '\n      <section class="philosophy-section">' + parts[1];
  fs.writeFileSync('frontend/index.html', html);
  console.log('done');
} else {
  console.log('Failed to find split boundaries');
}
