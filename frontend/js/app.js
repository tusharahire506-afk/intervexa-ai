(() => {
  const currentYear = document.querySelector('#current-year');
  if (currentYear) currentYear.textContent = String(new Date().getFullYear());
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const apiBase = (window.INTERVEXA_API_BASE || '').replace(/\/$/, '');
  const apiUrl = (path) => `${apiBase}${path}`;
  let csrfToken = '';
  let currentUser = null;
  const reportStorage = () => currentUser ? localStorage : sessionStorage;
  const reportStorageKey = () => currentUser ? `intervexa-interview-reports-${currentUser.id}` : 'intervexa-guest-interview-reports';
  const readStoredReports = () => {
    try {
      const reports = JSON.parse(reportStorage().getItem(reportStorageKey()) || '[]');
      return Array.isArray(reports) ? reports : [];
    } catch (error) {
      console.warn('Stored interview reports could not be read:', error);
      return [];
    }
  };
  const writeStoredReports = (reports) => reportStorage().setItem(reportStorageKey(), JSON.stringify(reports.slice(0, 20)));
  const progressStorageKey = () => currentUser ? `intervexa-active-interview-${currentUser.id}` : 'intervexa-active-guest-interview';
  const readInterviewProgress = () => {
    try {
      const progress = JSON.parse(reportStorage().getItem(progressStorageKey()) || 'null');
      return progress && Array.isArray(progress.questions) ? progress : null;
    } catch (error) {
      console.warn('Saved interview progress could not be read:', error);
      return null;
    }
  };
  const persistInterviewProgress = () => {
    if (interviewSessionState !== 'active' || !questions.length) return;
    reportStorage().setItem(progressStorageKey(), JSON.stringify({
      config: sessionConfig,
      questions,
      answers,
      evaluations,
      conversation,
      questionIndex,
      seconds
    }));
  };
  const clearInterviewProgress = () => reportStorage().removeItem(progressStorageKey());
  const categories = [
    ['HR Interview','Culture & motivation','♙'],['Technical Interview','Core technical concepts','⌘'],['Coding Interview','Algorithms & code','</>'],['Behavioral Interview','Stories & leadership','♧'],
    ['System Design Interview','Architecture & scale','◫'],['Managerial Interview','People & priorities','◎'],['Communication Skills Interview','Speak with clarity','◒'],['Resume-Based Interview','Your experience','▤'],
    ['Internship Interview','Start your career','✦'],['Placement Interview','Campus recruitment','◉'],['Domain-Specific Interview','Your industry focus','◌'],['Custom Interview','Build your own session','＋']
  ];
  const projectTypes = [
    ['Minor Project Viva','Short project review','◌'],['Major Project Viva','End-to-end defense','◈'],['Final Year Project Defense','Final evaluation','✦'],['B.Tech Project Interview','Engineering panel','⌘'],
    ['Diploma Project Viva','Practical fundamentals','▤'],['AI/ML Project Defense','Models & metrics','∿'],['Web Development Project Viva','Frontend to backend','◇'],['Research Project Defense','Methods & novelty','⌁'],
    ['Software Engineering Project Interview','Process & quality','⚙'],['Group Project Presentation','Team delivery','◎'],['Individual Project Defense','Your ownership','♙'],['Project Demonstration Questions','Demo readiness','▷'],
    ['Technical Project Evaluation','Architecture review','◫'],['Custom Project Viva','Build your own viva','＋']
  ];
  const projectCategories = [
    'Introduction and overview','Problem statement','Objectives and motivation','System architecture','Technology stack','Implementation','Database','Algorithms','Machine learning',
    'Testing','Results','Project challenges','Team contribution','Individual contribution','Limitations','Future scope','Research novelty','Real-world applications'
  ];
  const projectPrompts = {
    'Introduction and overview': 'Give us a concise overview of your project and the problem it addresses.',
    'Problem statement': 'What specific problem does your project solve, and how did you validate that it mattered?',
    'Objectives and motivation': 'What motivated this project and what were its primary objectives?',
    'System architecture': 'Walk us through your system architecture and the reasoning behind its key components.',
    'Technology stack': 'Why did you choose this technology stack over the alternatives?',
    'Implementation': 'Describe the most important implementation decision in your project.',
    'Database': 'Explain your data model and how you handled consistency and performance.',
    'Algorithms': 'Which algorithm is central to your project, and what are its trade-offs?',
    'Machine learning': 'How did you prepare data, select a model, and evaluate its performance?',
    'Testing': 'What testing strategy did you use and what important defect did it uncover?',
    'Results': 'What results did you achieve, and how did you measure success?',
    'Project challenges': 'What was the hardest challenge in the project and how did you overcome it?',
    'Team contribution': 'How did the team divide responsibilities and resolve disagreements?',
    'Individual contribution': 'Which parts did you personally own and how can you demonstrate that work?',
    'Limitations': 'What are the current limitations of your project?',
    'Future scope': 'If you had another semester, what would you improve or add?',
    'Research novelty': 'What is novel about your approach compared with existing work?',
    'Real-world applications': 'How could this project be used in a real-world setting?'
  };
  const prompts = {
    'Technical Interview': "Walk me through a technical project you are proud of and the decisions you made.",
    'HR Interview': "Why are you interested in this role, and what would you bring to our team?",
    'Behavioral Interview': "Tell me about a time you had to handle a difficult or ambiguous situation.",
    'Coding Interview': "How would you approach solving a problem you have not seen before?",
    'System Design Interview': "How would you design a reliable system that serves a growing number of users?",
    'Case Study Interview': "How would you evaluate a product whose user engagement has recently declined?",
    'Resume-Based Interview': "Which experience on your resume best demonstrates your strengths?",
    'Company-Specific Interview': "What about this company and its products interests you most?",
    'Internship Interview': "What would you like to learn during this internship?",
    'Placement Interview': "Tell me about a project or activity that shows your potential.",
    'Aptitude Interview': "How do you break down a complex problem when you have limited time?",
    'Communication Skills Interview': "Explain a complex idea to someone who is new to the subject.",
    'Group Discussion Practice': "What is your perspective on the future of remote work?",
    'Managerial Interview': "How do you help a team stay aligned when priorities change?",
    'Domain-Specific Interview': "Which trends or challenges are shaping your target industry right now?",
    'Custom Interview': "What is one professional goal you are working toward right now?"
  };
  const technicalTopics = [
    'Data Structures and Algorithms','C Programming','C++','Java','Python','JavaScript',
    'Object-Oriented Programming','DBMS','SQL','Operating Systems','Computer Networks',
    'Software Engineering','Web Development','Full Stack Development','Artificial Intelligence',
    'Machine Learning','Deep Learning','Cloud Computing','Cybersecurity','System Design',
    'Git and GitHub','Computer Science Fundamentals','Technical Project Viva','Coding Problems',
    'Debugging Interviews','Code Review Interviews'
  ];
  let selectedType = 'Technical Interview';
  let questionIndex = 0;
  let questions = [];
  let timerId;
  let seconds = 0;
  let stream;
  let micStream;
  let cameraOn = false;
  let micOn = false;
  let sessionConfig = {};
  let answers = [];
  let recognition;
  let recognizing = false;
  let paused = false;
  let speechSupported = false;
  let speechStarting = false;
  let interviewerVoiceMuted = false;
  let currentUtterance;
  let speechVoices = [];
  let speechRate = 0.94;
  let speechVolume = 1;
  let speechPaused = false;
  let speechToken = 0;
  let ttsSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  let cameraRequestId = 0;
  let liveTranscript = '';
  let conversation = [];
  let processingAnswer = false;
  let analysisInFlight = false;
  let interviewInitializationInFlight = false;
  let interviewSessionState = 'idle';
  let interviewInitializationToken = 0;
  let evaluations = [];
  let finalAnalysis;
  let analysisError = '';
  let practiceResults = {};
  let aiSpeaking = false;
  let recognitionPaused = false;
  let audioContext;
  let audioAnalyser;
  let audioFrame;
  let feedbackContinueResolve;
  let projectMode = false;
  let selectedProjectCategories = projectCategories.slice(0, 6);
  let careerMessages = [];
  let projectQuestionBank = JSON.parse(sessionStorage.getItem('intervexa-project-question-bank') || '{}');
  let selectedProjectQuestionCategory = '';
  let projectQuestionFilter = 'all';
  let projectQuestionSearch = '';
  let projectPracticeQuestion;
  let projectPracticeAttempts = JSON.parse(sessionStorage.getItem('intervexa-project-viva-attempts') || '[]');
  let projectPracticeRecognition;
  let demoIndex = 0;
  let demoTimer;
  let demoPlaying = false;

  const showToast = (message) => {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => toast.classList.remove('show'), 2800);
  };
  const authRequest = async (path, options = {}) => {
    const response = await fetch(apiUrl(path), {
      ...options,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...(options.headers || {}) }
    });
    const result = await readJsonResponse(response, 'Authentication request failed');
    if (!response.ok || result.success === false) throw new Error(`${result.error || 'Authentication request failed'}${result.code ? ` (${result.code})` : ''}`);
    return result;
  };
  const ensureCsrf = async () => {
    const response = await fetch(apiUrl('/api/auth/csrf'), { credentials: 'include' });
    const result = await readJsonResponse(response, 'Security setup failed');
    csrfToken = result.csrf_token || '';
  };
  const setAuthView = (view) => {
    $('#login-form').classList.toggle('hidden', view !== 'login');
    $('#signup-form').classList.toggle('hidden', view !== 'signup');
    $('#forgot-form').classList.toggle('hidden', view !== 'forgot');
    $('#reset-form').classList.toggle('hidden', view !== 'reset');
    $$('.auth-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.authView === view));
    $('#auth-title').textContent = view === 'signup' ? 'Create your practice space.' : (view === 'forgot' || view === 'reset') ? 'Reset your password.' : 'Practice with a personal edge.';
    $('#auth-error').textContent = '';
  };
  const openAuth = (view = 'login') => {
    $('#auth-modal').classList.remove('hidden');
    setAuthView(view);
    (view === 'signup' ? $('#signup-name') : $('#login-email')).focus();
  };
  const closeAuth = () => $('#auth-modal').classList.add('hidden');
  const requireAuth = (continuation) => {
    if (currentUser) return false;
    openAuth('login');
    $('#auth-subtitle').textContent = 'Create a free account or sign in to continue and save your progress.';
    if (continuation) sessionStorage.setItem('intervexa-auth-continuation', continuation);
    return true;
  };
  const applyUser = (user) => {
    currentUser = user;
    if (user) {
      $('.avatar').textContent = (user.name || 'U').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
      $('.avatar').setAttribute('aria-label', `Open profile for ${user.name}`);
      $('#dashboard-greeting').textContent = `Welcome back, ${(user.name || 'there').split(' ')[0]}.`;
    }
  };
  const loadUserHistory = async () => {
    if (!currentUser) {
      const reports = readStoredReports();
      const scores = reports.map((item) => item.analysis?.overall_score).filter((score) => typeof score === 'number');
      $('#summary-count').textContent = String(reports.length);
      $('#summary-average').innerHTML = `${scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : '—'}<span>/100</span>`;
      $('#recent-interviews').innerHTML = reports.length ? reports.slice(0, 3).map((report) => `<div class="list-row"><span class="list-icon technical">✦</span><div><strong>${escapeHtml(report.config?.type || 'Interview')}</strong><small>Guest session · ${escapeHtml(new Date(report.createdAt || Date.now()).toLocaleDateString())}</small></div><b class="score average">${typeof report.analysis?.overall_score === 'number' ? report.analysis.overall_score : '—'}</b><button class="report-button" type="button" data-action="view-report">View report</button></div>`).join('') : '<p class="conversation-empty">Guest results will appear here for this browser session.</p>';
      $('#hero-session-count').textContent = String(reports.length);
      $('#hero-streak').textContent = 'Start your practice streak';
      $('#summary-streak').innerHTML = '0 <small>days</small>';
      $('#summary-best').textContent = scores.length ? Math.max(...scores) : '—';
      $('#dashboard-skills').innerHTML = '<p class="conversation-empty">Sign in to save your skill snapshot.</p>';
      return;
    }
    try {
      const result = await authRequest('/api/interviews', { method: 'GET', headers: {} });
      const reports = result.interviews || [];
      const scores = reports.map((item) => item.analysis?.overall_score).filter((score) => typeof score === 'number');
      $('#summary-count').textContent = String(reports.length);
      $('#summary-average').innerHTML = `${scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : '—'}<span>/100</span>`;
      $('#recent-interviews').innerHTML = reports.length ? reports.slice(0, 3).map((report) => {
        const type = report.config?.type || 'Interview';
        const score = report.analysis?.overall_score;
        const created = report.created_at ? new Date(report.created_at.replace(' ', 'T') + 'Z').toLocaleDateString() : 'Recently';
        const scoreClass = typeof score === 'number' && score >= 75 ? 'good' : 'average';
        return `<div class="list-row"><span class="list-icon technical">✦</span><div><strong>${escapeHtml(type)}</strong><small>${escapeHtml(report.config?.role || 'Practice session')} · ${escapeHtml(created)}</small></div><b class="score ${scoreClass}">${typeof score === 'number' ? score : '—'}</b><button class="report-button" type="button" data-action="view-cloud-report" data-report-id="${report.id}">View report</button></div>`;
      }).join('') : '<p class="conversation-empty">No saved interviews yet. Start your first practice session.</p>';
      const dashboard = await authRequest('/api/dashboard', { method: 'GET', headers: {} });
      const summary = dashboard.summary;
      $('#hero-session-count').textContent = String(summary.interviews_completed);
      $('#hero-streak').textContent = summary.practice_streak ? `Keep your ${summary.practice_streak}-day streak going` : 'Start your practice streak';
      $('#summary-streak').innerHTML = `${summary.practice_streak} <small>days</small>`;
      $('#summary-best').textContent = summary.best_score ?? '—';
      const categoryScores = (summary.category_scores || []).sort((a, b) => a.score - b.score);
      $('#dashboard-skills').innerHTML = categoryScores.length ? categoryScores.slice(0, 3).map((skill) => `<div class="skill"><div><span>${escapeHtml(skill.name)}</span><b>${skill.score}%</b></div><div class="skill-track"><i style="width:${skill.score}%"></i></div></div>`).join('') : '<p class="conversation-empty">Complete an interview to calculate your snapshot.</p>';
      if (categoryScores.length) $('#dashboard-tip').innerHTML = `<span>✦</span> Focus next on ${escapeHtml(categoryScores[0].name)}.`;
    } catch (error) {
      showToast(`History unavailable: ${error.message}`);
    }
  };
  const loadAuthSession = async () => {
    try {
      await ensureCsrf();
      const result = await authRequest('/api/auth/session', { method: 'GET', headers: {} });
      applyUser(result.user);
      await loadUserHistory();
    } catch (error) {
      console.warn('Authentication session unavailable:', error.message);
    }
  };
  const continueAfterAuth = () => {
    const continuation = sessionStorage.getItem('intervexa-auth-continuation');
    sessionStorage.removeItem('intervexa-auth-continuation');
    if (continuation === 'start-setup') { enterDashboard(); showView('setup-view'); updateProjectSetup(); }
    if (continuation === 'project-start') { enterDashboard(); projectMode = true; showView('setup-view'); updateProjectSetup(); }
  };
  const continueAsGuest = async () => {
    if (currentUser) {
      try {
        await authRequest('/api/auth/logout', { method: 'POST', body: '{}' });
      } catch (error) {
        showToast(`Could not switch to Guest Mode: ${error.message}`);
        return;
      }
    }
    applyUser(null);
    closeAuth();
    enterDashboard();
    continueAfterAuth();
    await loadUserHistory();
  };
  const demoSteps = [
    ['Choose your interview', 'Start with a role-focused session and tune the difficulty, language, and interview mode.', '<div class="demo-ui demo-selection"><button class="demo-choice active">Technical interview <small>Adaptive · 5 questions</small></button><button class="demo-choice">Project viva <small>Deep project review</small></button></div>'],
    ['Meet your AI interviewer', 'The interviewer asks a focused question and keeps the conversation centered on your goals.', '<div class="demo-ui demo-question"><span>QUESTION 01 / 05</span><strong>Tell me about a project you are particularly proud of.</strong><i>AI is listening</i></div>'],
    ['Get question-wise feedback', 'After your answer, see what was strong, what was missing, and how to improve the next response.', '<div class="demo-ui demo-feedback"><b>84 / 100</b><span>Strong structure and clear ownership</span><small>Improve technical depth · Add measurable impact</small></div>'],
    ['Leave with a clear plan', 'Your final report turns every answer into a personalized practice plan for the next interview.', '<div class="demo-ui demo-report"><span>INTERVIEW READINESS</span><strong>Ready to progress</strong><i><em></em><em></em><em></em><em></em><em></em></i></div>']
  ];
  const renderDemo = () => {
    const [title, copy, content] = demoSteps[demoIndex];
    $('#demo-step-label')?.remove();
    $('#demo-step-title').textContent = title;
    $('#demo-step-copy').textContent = copy;
    $('#demo-step').querySelector('.demo-ui')?.remove();
    $('#demo-step').insertAdjacentHTML('beforeend', content);
    $('.demo-step-label').textContent = `${String(demoIndex + 1).padStart(2, '0')} / ${demoSteps.length}`;
    $$('#demo-dots i').forEach((dot, index) => dot.classList.toggle('active', index === demoIndex));
  };
  const stopDemo = () => { clearInterval(demoTimer); demoTimer = undefined; demoPlaying = false; };
  const startDemo = () => {
    stopDemo();
    demoPlaying = true;
    $('[data-action="toggle-demo"]').textContent = 'Pause demo';
    demoTimer = setInterval(() => {
      demoIndex = (demoIndex + 1) % demoSteps.length;
      renderDemo();
    }, 4200);
  };
  const openDemo = () => {
    demoIndex = 0;
    $('#demo-modal').classList.remove('hidden');
    document.body.classList.add('demo-open');
    renderDemo();
    startDemo();
    $('.demo-close').focus();
  };
  const closeDemo = () => {
    stopDemo();
    $('#demo-modal').classList.add('hidden');
    document.body.classList.remove('demo-open');
  };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
  const listHtml = (items, empty = 'Not available.') => {
    const values = Array.isArray(items) ? items.filter(Boolean) : [];
    return values.length ? `<ul>${values.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : `<p>${escapeHtml(empty)}</p>`;
  };
  const projectContext = () => ({
    project_name: $('#project-name')?.value.trim() || '',
    project_description: $('#project-description')?.value.trim() || '',
    technology_stack: $('#project-stack')?.value.trim() || '',
    contribution: $('#project-contribution')?.value.trim() || ''
  });
  const saveProjectState = () => {
    sessionStorage.setItem('intervexa-project-question-bank', JSON.stringify(projectQuestionBank));
    sessionStorage.setItem('intervexa-project-viva-attempts', JSON.stringify(projectPracticeAttempts.slice(-100)));
  };
  const projectStats = (category) => {
    const items = projectQuestionBank[category] || [];
    return {
      total: items.length,
      completed: items.filter((item) => item.completed).length,
      difficult: items.filter((item) => item.difficult).length
    };
  };
  const requestProjectQuestions = async (category, count, append = false) => {
    const context = projectContext();
    if (!context.project_name && !context.project_description && !context.technology_stack) {
      throw new Error('Add a project name, description, or technology stack so Gemini can generate project-specific questions.');
    }
    const response = await fetch(apiUrl('/api/project-viva/questions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, count, difficulty: $('#project-difficulty').value, context, existing_questions: append ? (projectQuestionBank[category] || []).map((item) => item.question) : [] })
    });
    const result = await readJsonResponse(response, 'Project question generation failed');
    if (!response.ok || result.success === false) throw new Error(`${result.error || 'Question generation failed'}${result.code ? ` (${result.code})` : ''}`);
    return Array.isArray(result.questions) ? result.questions : [];
  };
  const renderProjectQuestionBank = () => {
    const panel = $('#project-question-bank');
    const list = $('#project-question-list');
    if (!panel || !list || !selectedProjectQuestionCategory) return;
    const items = projectQuestionBank[selectedProjectQuestionCategory] || [];
    const visible = items.filter((item) => {
      const searchMatch = !projectQuestionSearch || item.question.toLowerCase().includes(projectQuestionSearch.toLowerCase());
      const filterMatch = projectQuestionFilter === 'all' || (projectQuestionFilter === 'completed' && item.completed) || (projectQuestionFilter === 'pending' && !item.completed) || (projectQuestionFilter === 'difficult' && item.difficult);
      return searchMatch && filterMatch;
    });
    $('#question-bank-title').textContent = `${selectedProjectQuestionCategory} · ${items.length} questions`;
    list.innerHTML = visible.length ? visible.map((item, index) => `<article class="project-question-card${item.completed ? ' completed' : ''}${item.difficult ? ' difficult' : ''}" data-question-id="${escapeHtml(item.id)}"><button class="project-question-summary" type="button" aria-expanded="false"><span class="question-index">${String(index + 1).padStart(2, '0')}</span><span class="project-question-text">${escapeHtml(item.question)}</span><span class="question-meta">${escapeHtml(item.difficulty || 'Medium')} · ${item.estimated_minutes || 3} min</span><span class="question-chevron">⌄</span></button><div class="project-question-details hidden"><p><b>Why it matters</b>${escapeHtml(item.why_important || 'This tests your understanding of the selected project area.')}</p><div class="question-reveal-actions"><button class="button button-quiet" type="button" data-question-action="reveal-expectations">What examiner expects</button><button class="button button-quiet" type="button" data-question-action="reveal-answer">Reveal ideal answer</button><button class="button button-quiet" type="button" data-question-action="practice">Practice this question</button><button class="button button-quiet" type="button" data-question-action="toggle-completed">${item.completed ? 'Mark pending' : 'Mark completed'}</button><button class="button button-quiet" type="button" data-question-action="toggle-difficult">${item.difficult ? 'Remove difficult' : 'Mark difficult'}</button><button class="button button-quiet" type="button" data-question-action="toggle-bookmark">${item.bookmarked ? '★ Bookmarked' : '☆ Bookmark'}</button></div><div class="question-expectations hidden"><p><b>Key points expected</b>${listHtml(item.key_points, 'No examiner points were returned.')}</p></div><div class="question-answer-reveal hidden"><p><b>Ideal answer</b>${escapeHtml(item.ideal_answer || 'Not revealed yet.')}</p><p><b>Common mistakes</b>${listHtml(item.common_mistakes)}</p><p><b>Examiner follow-ups</b>${listHtml(item.follow_ups)}</p></div></div></article>`).join('') : '<p class="conversation-empty">No questions match this filter.</p>';
  };
  const generateProjectQuestions = async (append = false) => {
    const category = selectedProjectQuestionCategory || projectCategories[0];
    selectedProjectQuestionCategory = category;
    $('#project-question-bank')?.classList.remove('hidden');
    $('#project-context-status').textContent = 'Gemini is building questions from your project context…';
    try {
      const count = Number.parseInt($('#project-question-count').value, 10);
      const generated = await requestProjectQuestions(category, append ? Math.max(5, Math.min(count, 10)) : count, append);
      const existing = projectQuestionBank[category] || [];
      const known = new Set(existing.map((item) => item.question.trim().toLowerCase()));
      projectQuestionBank[category] = [...existing, ...generated.filter((item) => item.question && !known.has(item.question.trim().toLowerCase())).map((item, index) => ({ ...item, id: `${Date.now()}-${index}`, category }))];
      saveProjectState();
      renderCategories();
      renderProjectQuestionBank();
      $('#project-context-status').textContent = `${projectQuestionBank[category].length} project-specific questions ready.`;
    } catch (error) {
      $('#project-context-status').textContent = error.message || 'Question generation failed.';
      showToast(error.message || 'Question generation failed.');
    }
  };
  const evaluateProjectAnswer = async (question, answer) => {
    const response = await fetch(apiUrl('/api/project-viva/evaluate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question.question, category: question.category, answer, context: projectContext() })
    });
    const result = await readJsonResponse(response, 'Project answer evaluation failed');
    if (!response.ok || result.success === false) throw new Error(`${result.error || 'Evaluation failed'}${result.code ? ` (${result.code})` : ''}`);
    return result.evaluation;
  };
  const openProjectPractice = (item) => {
    projectPracticeQuestion = item;
    let panel = $('#project-practice-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'project-practice-panel';
      panel.className = 'panel project-practice-panel';
      $('#project-question-bank').appendChild(panel);
    }
    panel.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">FOCUSED PRACTICE</p><h3>${escapeHtml(item.question)}</h3></div><button class="text-button" type="button" data-question-action="close-practice">Close</button></div><textarea id="project-practice-answer" rows="5" placeholder="Explain your answer as you would in a viva…"></textarea><div class="practice-actions"><button class="button button-primary" type="button" data-question-action="submit-practice">Evaluate answer</button><button class="button button-quiet" type="button" data-question-action="start-practice-speaking">Start Speaking</button></div><div id="project-practice-result" aria-live="polite"></div>`;
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const readJsonResponse = async (response, fallbackMessage) => {
    const body = await response.text();
    if (!body.trim()) throw new Error(`${fallbackMessage} (empty response, HTTP ${response.status})`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      const preview = body.replace(/\s+/g, ' ').slice(0, 180);
      throw new Error(`${fallbackMessage} (non-JSON response, HTTP ${response.status}: ${preview})`);
    }
    try {
      return JSON.parse(body);
    } catch (error) {
      throw new Error(`${fallbackMessage} (invalid JSON response, HTTP ${response.status})`);
    }
  };
  const careerProfile = () => ({
    goal: $('#career-goal').value.trim(),
    targetRole: $('#career-role').value.trim(),
    experience: $('#career-experience').value,
    timeline: $('#career-timeline').value,
    skills: $('#career-skills').value.trim(),
    constraints: $('#career-constraints').value.trim()
  });
  const requestCareerCoach = async (messages, profile) => {
    if (window.location.protocol === 'file:') {
      showToast('Run the Flask app to connect the secure AI career coach.');
      return null;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(apiUrl('/api/career-coach/respond'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, profile }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const result = await readJsonResponse(response, 'Evaluation request failed');
      if (!response.ok) throw new Error(result.error || 'Career coach unavailable.');
      return result.message;
    } catch (error) {
      showToast(error.message || 'Career coach unavailable.');
      return null;
    }
  };
  const requestFeature = async (path, body) => {
    const response = await fetch(apiUrl(path), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
      body: JSON.stringify(body)
    });
    const result = await readJsonResponse(response, 'AI feature request failed');
    if (!response.ok || result.success === false) throw new Error(`${result.error || 'AI feature unavailable'}${result.code ? ` (${result.code})` : ''}`);
    return result;
  };
  const renderResumeAnalysis = (analysis) => {
    $('#resume-output').innerHTML = `<p class="eyebrow">AI REVIEW · ${escapeHtml(analysis.overall_score)}/100</p><h3>${escapeHtml(analysis.summary)}</h3><p><b>Strengths</b></p>${listHtml(analysis.strengths)}<p><b>Weaknesses</b></p>${listHtml(analysis.weaknesses)}<p><b>Missing keywords</b></p>${listHtml(analysis.missing_keywords)}<p><b>Interview questions</b></p>${listHtml(analysis.interview_questions)}`;
  };
  const generateCodingQuestion = async () => {
    $('#coding-question').textContent = 'Generating a grounded coding problem…';
    try {
      const result = await requestFeature('/api/coding/question', { topic: $('#coding-topic').value, difficulty: $('#coding-difficulty').value });
      window.currentCodingQuestion = result.question;
      $('#coding-question').innerHTML = `<p class="eyebrow">${escapeHtml(result.question.title || 'CODING PROBLEM')}</p><h3>${escapeHtml(result.question.problem)}</h3><p><b>Input:</b> ${escapeHtml(result.question.input_format || '')}</p><p><b>Output:</b> ${escapeHtml(result.question.output_format || '')}</p>`;
      $('#coding-answer-panel').classList.remove('hidden');
    } catch (error) { $('#coding-question').innerHTML = `<p class="error-state">${escapeHtml(error.message)}</p>`; }
  };
  const evaluateCodingAnswer = async () => {
    const answer = $('#coding-answer').value.trim();
    if (!answer || !window.currentCodingQuestion) { showToast('Generate a problem and submit a solution first.'); return; }
    $('#coding-output').textContent = 'Evaluating your solution…';
    try {
      const result = await requestFeature('/api/coding/evaluate', { problem: window.currentCodingQuestion.problem, answer, language: 'Python' });
      const evaluation = result.evaluation;
      $('#coding-output').innerHTML = `<div class="feature-evaluation"><strong>${escapeHtml(evaluation.score)}/100</strong><p><b>Correctness:</b> ${escapeHtml(evaluation.correctness)}</p><p><b>Complexity:</b> ${escapeHtml(evaluation.complexity)}</p><p><b>Bugs:</b> ${listHtml(evaluation.bugs)}</p><p><b>Improvements:</b> ${listHtml(evaluation.improvements)}</p></div>`;
    } catch (error) { $('#coding-output').innerHTML = `<p class="error-state">${escapeHtml(error.message)}</p>`; }
  };
  const loadSkills = async () => {
    if (!currentUser) { $('#skills-output').innerHTML = '<p class="conversation-empty">Sign in and complete interviews to calculate skill progress.</p>'; return; }
    try {
      const result = await authRequest('/api/skills', { method: 'GET', headers: {} });
      $('#skills-output').innerHTML = result.skills.length ? result.skills.map((skill) => `<div class="skill"><div><span>${escapeHtml(skill.name)}</span><b>${skill.score}%</b></div><div class="skill-track"><i style="width:${skill.score}%"></i></div></div>`).join('') : '<p class="conversation-empty">Complete an interview to calculate your skill progress.</p>';
    } catch (error) { $('#skills-output').innerHTML = `<p class="error-state">${escapeHtml(error.message)}</p>`; }
  };
  const appendCoachMessage = (speaker, text) => {
    const history = $('#career-chat-history');
    history.querySelector('.conversation-empty')?.remove();
    const item = document.createElement('div');
    item.className = `coach-message ${speaker === 'You' ? 'user' : 'ai'}`;
    const label = document.createElement('b');
    label.textContent = speaker;
    const content = document.createElement('span');
    content.textContent = text;
    item.append(label, content);
    history.appendChild(item);
    history.scrollTop = history.scrollHeight;
  };
  const generateCareerRoadmap = async (event) => {
    event.preventDefault();
    const profile = careerProfile();
    if (!profile.goal && !profile.targetRole) {
      showToast('Add a career goal or target role first.');
      return;
    }
    const roadmap = $('#career-roadmap');
    roadmap.textContent = 'Generating a grounded roadmap…';
    const message = await requestCareerCoach([{
      role: 'user',
      content: `Create a practical career roadmap for me. Include: career direction, recommended roles, current skill assessment, skill gaps, interview preparation recommendations, a personalized learning plan, and milestones for ${profile.timeline}. Use clear headings and numbered steps.`
    }], profile);
    if (!message) {
      roadmap.textContent = 'AI roadmap unavailable. Configure an AI provider and try again.';
      return;
    }
    roadmap.textContent = message;
  };
  const sendCareerMessage = async (event) => {
    event.preventDefault();
    const input = $('#career-chat-input');
    const text = input.value.trim();
    if (!text) return;
    const profile = careerProfile();
    careerMessages.push({ role: 'user', content: text });
    appendCoachMessage('You', text);
    input.value = '';
    const response = await requestCareerCoach(careerMessages, profile);
    if (!response) {
      appendCoachMessage('Career coach', 'AI coach is unavailable right now. Please configure an AI provider and try again.');
      return;
    }
    careerMessages.push({ role: 'assistant', content: response });
    appendCoachMessage('Career coach', response);
  };
  const views = ['dashboard-view', 'setup-view', 'interview-view', 'feedback-view'];
  const showView = (view) => {
    if (view !== 'interview-view' && currentUtterance) stopSpeech();
    views.forEach((id) => {
      const element = $(`#${id}`);
      element.classList.toggle('hidden', id !== view);
      if (id === view) {
        element.classList.remove('view-enter');
        requestAnimationFrame(() => element.classList.add('view-enter'));
      }
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $$('.nav-links a').forEach((link) => link.classList.toggle('active', link.dataset.nav === (view === 'dashboard-view' ? 'dashboard' : 'practice')));
  };
  const navigateToSection = (section, link) => {
    enterDashboard();
    showView('dashboard-view');
    $$('.nav-links a').forEach((item) => item.classList.toggle('active', item === link));
    const destination = section === 'dashboard' ? 'dashboard' : section === 'practice' ? 'practice' : section === 'projects' ? 'project-viva' : section === 'resume' ? 'resume-analyzer' : section === 'coding' ? 'coding-arena' : section === 'skills' ? 'skill-galaxy' : section === 'history' ? 'history' : 'career-coach';
    requestAnimationFrame(() => document.getElementById(destination)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const enterDashboard = () => {
    const intro = $('#cinematic-intro');
    if (!intro) return;
    intro.classList.add('dismissed');
    document.body.classList.remove('intro-active');
    setTimeout(() => $('#cinematic-intro')?.remove(), 700);
  };
  const renderCategories = () => {
    const topicSelect = $('#topics');
    if (topicSelect && !topicSelect.options.length) {
      topicSelect.innerHTML = technicalTopics.map((topic) => `<option value="${topic}">${topic}</option>`).join('');
    }
    const featuredCategories = [
      ['HR Interview', 'Culture, motivation, and fit', '♙', '15 min'],
      ['Technical Interview', 'Core concepts and practical depth', '⌘', '20 min'],
      ['Coding Interview', 'Algorithms, logic, and complexity', '</>', '30 min'],
      ['Behavioral Interview', 'Structured stories and reflection', '♧', '15 min'],
      ['System Design Interview', 'Architecture, scale, and trade-offs', '◫', '30 min'],
      ['Project Viva', 'Ownership and implementation depth', '◈', '20 min'],
      ['Communication Skills Interview', 'Clarity, confidence, and delivery', '◒', '15 min'],
      ['Internship Interview', 'Early-career readiness and growth', '✦', '15 min'],
      ['Custom Interview', 'Build a focused practice session', '＋', 'Flexible']
    ];
    $('#category-grid').innerHTML = featuredCategories.map(([name, description, icon, duration]) =>
      `<article class="category-card flip-card" tabindex="0" role="button" aria-expanded="false" aria-label="Explore ${name}" data-flip-card><div class="flip-card-inner"><div class="flip-card-face flip-card-front"><span>${icon}</span><strong>${name}</strong><small>${description}</small><em>Explore focus ↗</em></div><div class="flip-card-face flip-card-back"><span class="flip-back-label">READY WHEN YOU ARE</span><strong>${name}</strong><small>${duration} · Adaptive AI feedback</small><button class="button button-primary" type="button" data-action="${name === 'Project Viva' ? 'project-start' : 'quick-start'}" data-type="${name === 'Project Viva' ? 'Technical Project Evaluation' : name}">Start interview <span>→</span></button></div></div></article>`).join('');
    $('#type-grid').innerHTML = categories.map(([name, description, icon]) =>
      `<button class="type-option${name === selectedType ? ' selected' : ''}" type="button" data-type-option="${name}"><span class="type-icon">${icon}</span><strong>${name}</strong><small>${description}</small></button>`).join('');
    $('#project-card-grid').innerHTML = projectTypes.map(([name, description, icon]) =>
      `<button class="project-card" type="button" data-action="project-start" data-type="${name}"><span class="project-card-icon">${icon}</span><strong>${name}</strong><small>${description}</small><b>Practice →</b></button>`).join('');
    $('#project-category-pills').innerHTML = projectCategories.map((category) => {
      const stats = projectStats(category);
      return `<button type="button" class="category-pill${selectedProjectCategories.includes(category) ? ' selected' : ''}${selectedProjectQuestionCategory === category ? ' active' : ''}" data-project-map-category="${escapeHtml(category)}" aria-pressed="${selectedProjectQuestionCategory === category}"><span>${escapeHtml(category)}</span><small>${stats.total ? `${stats.completed}/${stats.total}` : 'Build bank'}</small></button>`;
    }).join('');
    $('#setup-project-categories').innerHTML = projectCategories.map((category) => `<button type="button" class="setup-category${selectedProjectCategories.includes(category) ? ' selected' : ''}" data-project-category="${category}">${category}</button>`).join('');
    updateProjectSetup();
  };
  const updateProjectSetup = () => {
    $('#project-setup-panel').classList.toggle('hidden', !projectMode);
    $('#project-selection-count').textContent = `${selectedProjectCategories.length} selected`;
  };
  const stopMedia = () => {
    stopCamera();
    stopRecognition();
    if (micStream) micStream.getTracks().forEach((track) => track.stop());
    micStream = undefined;
    stopAudioVisualizer();
    micOn = false;
    updateMedia();
  };
  const startAudioVisualizer = () => {
    const visualizer = $('#mic-visualizer');
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!visualizer || !micStream || !AudioContext) return;
    stopAudioVisualizer();
    audioContext = new AudioContext();
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 64;
    audioContext.createMediaStreamSource(micStream).connect(audioAnalyser);
    const data = new Uint8Array(audioAnalyser.frequencyBinCount);
    visualizer.innerHTML = Array.from({ length: 18 }, () => '<i></i>').join('');
    const draw = () => {
      if (!audioAnalyser) return;
      audioAnalyser.getByteFrequencyData(data);
      visualizer.querySelectorAll('i').forEach((bar, index) => {
        const value = data[index % data.length] / 255;
        bar.style.height = `${Math.max(4, value * 34)}px`;
      });
      audioFrame = requestAnimationFrame(draw);
    };
    draw();
  };
  const stopAudioVisualizer = () => {
    if (audioFrame) cancelAnimationFrame(audioFrame);
    audioFrame = undefined;
    if (audioContext) audioContext.close();
    audioContext = undefined;
    audioAnalyser = undefined;
    const visualizer = $('#mic-visualizer');
    if (visualizer) visualizer.innerHTML = '';
  };
  const updateMedia = () => {
    $('#camera-video').style.display = cameraOn ? 'block' : 'none';
    $('#camera-placeholder').style.display = cameraOn ? 'none' : 'block';
    $$('[data-action="toggle-camera"], [data-action="toggle-mic"]').forEach((button) => {
      button.classList.toggle('active', button.dataset.action === 'toggle-camera' ? cameraOn : micOn);
    });
    const cameraButton = $('[data-action="toggle-camera"] span');
    if (cameraButton) cameraButton.textContent = cameraOn ? 'Camera ON' : 'Camera OFF';
    $('#permission-state').textContent = `${stream ? `Camera ${cameraOn ? 'on' : 'off'}` : 'Camera off'} · Microphone ${micOn ? 'ON' : 'OFF'}.`;
    const micButton = $('[data-action="toggle-mic"]');
    if (micButton) {
      micButton.classList.toggle('active', micOn);
      micButton.querySelector('span').textContent = micOn ? 'Microphone ON' : 'Microphone OFF';
    }
  };
  const modeIsVoice = () => ['Voice Interview with Live Transcript', 'Camera + Voice Interview'].includes(sessionConfig.mode);
  const modeIsCamera = () => sessionConfig.mode === 'Camera + Voice Interview';
  const speechLanguage = () => sessionConfig.language === 'Hindi' ? 'hi-IN' : sessionConfig.language === 'Hinglish' ? 'en-IN' : 'en-US';
  const updateModeSwitch = () => {
    $('#mode-switch-label').textContent = modeIsVoice() ? 'Switch to text' : 'Switch to voice';
    $('#answer-input').placeholder = modeIsVoice() ? 'Speak naturally, or edit the transcription here…' : 'Type your answer here…';
  };
  const appendConversation = (speaker, text, editable = false) => {
    if (!text.trim()) return;
    conversation.push({ speaker, text: text.trim() });
    const history = $('#conversation-history');
    history.querySelector('.conversation-empty')?.remove();
    const item = document.createElement('p');
    item.className = `conversation-entry ${speaker === 'You' ? 'candidate-entry' : 'ai-entry'}`;
    item.innerHTML = `<b>${speaker}</b><span>${text.trim()}</span>`;
    if (editable) {
      item.contentEditable = 'true';
      item.title = 'Edit this transcript before submitting';
      item.addEventListener('blur', () => { const entry = conversation[conversation.length - 1]; if (entry) entry.text = item.querySelector('span').textContent.trim(); });
    }
    history.appendChild(item);
    history.scrollTop = history.scrollHeight;
  };
  const renderLiveTranscript = (text) => {
    const history = $('#conversation-history');
    let item = $('#live-transcript-entry');
    if (!text.trim()) {
      item?.remove();
      return;
    }
    history.querySelector('.conversation-empty')?.remove();
    if (!item) {
      item = document.createElement('p');
      item.id = 'live-transcript-entry';
      item.className = 'conversation-entry candidate-entry live-transcript-entry';
      item.innerHTML = '<b>You</b><span></span>';
      history.appendChild(item);
    }
    item.querySelector('span').textContent = text.trim();
    history.scrollTop = history.scrollHeight;
  };
  const requestAIResponse = async (answer) => {
    if (window.location.protocol === 'file:') {
      showToast('Run the Flask app to connect the secure AI service.');
      return null;
    }
    const messages = [
      { role: 'system', content: `You are a ${sessionConfig.personality} mock interviewer for a ${sessionConfig.type}. Ask one concise next question based on the actual answer. Role: ${sessionConfig.role}. Difficulty: ${sessionConfig.difficulty}. Respond in ${sessionConfig.language}; for Hinglish, naturally mix Hindi and English while preserving technical terms. ${sessionConfig.topics ? `Topics: ${sessionConfig.topics}.` : ''} ${projectMode ? `Project question categories: ${selectedProjectCategories.join(', ')}.` : ''}` },
      ...conversation.map((entry) => ({ role: entry.speaker === 'You' ? 'user' : 'assistant', content: entry.text }))
    ];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(apiUrl('/api/interview/respond'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const result = await readJsonResponse(response, 'AI follow-up request failed');
      if (!response.ok || result.success === false) throw new Error(`${result.error || 'AI service unavailable'}${result.code ? ` (${result.code})` : ''}`);
      return result.message;
    } catch (error) {
      showToast(error.message || 'AI follow-up request failed.');
      return null;
    }
  };
  const requestEvaluation = async (question, answer) => {
    if (window.location.protocol === 'file:') return null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(apiUrl('/api/interview/evaluate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer, context: conversation, language: sessionConfig.language }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const result = await readJsonResponse(response, 'AI evaluation request failed');
      if (!response.ok || result.success === false) throw new Error(`${result.error || 'Evaluation unavailable'}${result.code ? ` (${result.code})` : ''}`);
      return result.evaluation;
    } catch (error) {
      showToast(error.message || 'AI evaluation request failed.');
      return null;
    }
  };
  const requestFinalAnalysis = async () => {
    if (window.location.protocol === 'file:') return null;
    analysisError = '';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const response = await fetch(apiUrl('/api/interview/analyze'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions,
          answers: questions.map((_, index) => answers[index] || ''),
          evaluations: questions.map((_, index) => evaluations[index] || null),
          config: sessionConfig
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const result = await readJsonResponse(response, 'Interview analysis request failed');
      if (!response.ok || result.success === false) throw new Error(`${result.error || 'Interview analysis unavailable.'}${result.code ? ` (${result.code})` : ''}`);
      if (!result.analysis || typeof result.analysis !== 'object') throw new Error('Interview analysis response did not contain valid analysis data.');
      return result.analysis;
    } catch (error) {
      analysisError = error.name === 'AbortError' ? 'The AI analysis request timed out after 30 seconds.' : (error.message || 'Interview analysis failed.');
      showToast(analysisError);
      return null;
    }
  };
  const saveInterviewReport = async (analysis) => {
    const report = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      config: sessionConfig,
      questions: [...questions],
      answers: [...answers],
      evaluations: [...evaluations],
      analysis
    };
    const reports = readStoredReports();
    reports.unshift(report);
    writeStoredReports(reports);
    clearInterviewProgress();
    if (currentUser) {
      try {
        await authRequest('/api/interviews', { method: 'POST', body: JSON.stringify({ config: sessionConfig, questions, answers, evaluations, analysis }) });
      } catch (error) {
        showToast(`Report saved locally, but cloud history failed: ${error.message}`);
      }
    }
  };
  const renderEvaluation = (evaluation) => {
    let panel = $('#answer-evaluation');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'answer-evaluation';
      panel.className = 'panel answer-evaluation hidden';
      panel.innerHTML = '<div class="panel-heading"><div><p class="eyebrow">ANSWER EVALUATION</p><h3>Professional feedback</h3></div><strong id="evaluation-score"></strong></div><div id="evaluation-criteria" class="evaluation-criteria"></div><div class="evaluation-copy"><b>What was correct</b><p id="evaluation-strengths"></p><b>What was incorrect</b><p id="evaluation-incorrect"></p><b>What could improve</b><p id="evaluation-weaknesses"></p><b>Missing key points</b><p id="evaluation-missing"></p><b>Improved answer</b><p id="evaluation-improved"></p><b>Next-step advice</b><p id="evaluation-advice"></p></div><button id="feedback-continue" class="button button-primary" type="button" data-action="continue-after-feedback">Continue to next question <span>→</span></button>';
      $('#interview-view').appendChild(panel);
    }
    if (!panel) return;
    if (!evaluation) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    $('#evaluation-score').textContent = `${evaluation.score}/10`;
    const labels = {
      correctness: 'Correctness',
      relevance: 'Relevance',
      technical_accuracy: 'Technical accuracy',
      completeness: 'Completeness',
      clarity: 'Clarity',
      communication: 'Communication quality'
    };
    $('#evaluation-criteria').innerHTML = Object.entries(labels).map(([key, label]) =>
      `<div><span>${label}</span><b>${evaluation.criteria[key]}/10</b></div>`).join('');
    $('#evaluation-strengths').textContent = (evaluation.strengths || []).join(' · ') || 'No strengths returned.';
    $('#evaluation-incorrect').textContent = (evaluation.incorrect_points || []).join(' · ') || 'No specific incorrect points identified.';
    $('#evaluation-weaknesses').textContent = (evaluation.weaknesses || []).join(' · ') || 'No weaknesses returned.';
    $('#evaluation-missing').textContent = (evaluation.missing_key_points || []).join(' · ') || 'No missing key points returned.';
    $('#evaluation-improved').textContent = evaluation.improved_answer || 'No improved answer returned.';
    $('#evaluation-advice').textContent = `${evaluation.improvement_advice || ''} ${evaluation.length_feedback || ''}`.trim();
    $('#feedback-continue').classList.toggle('hidden', sessionConfig.feedbackMode !== 'After every question');
  };
  const stopCamera = () => {
    cameraRequestId += 1;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = undefined;
    cameraOn = false;
    $('#camera-video').srcObject = null;
    updateMedia();
  };
  const requestMedia = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      $('#permission-state').textContent = 'This browser does not support camera access. You can continue without video.';
      showToast('Camera controls are not supported in this browser.');
      return;
    }
    try {
      const requestId = cameraRequestId + 1;
      cameraRequestId = requestId;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      stream = undefined;
      cameraOn = false;
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (requestId !== cameraRequestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      $('#camera-video').srcObject = stream;
      await $('#camera-video').play();
      cameraOn = true;
      stream.getVideoTracks().forEach((track) => { track.enabled = cameraOn; });
      updateMedia();
      showToast('Camera is ready.');
    } catch (error) {
      stopCamera();
      const message = error.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access in your browser settings.'
        : error.name === 'NotFoundError'
          ? 'No camera was found. You can continue without video.'
          : 'Camera could not be started. You can continue without video.';
      $('#permission-state').textContent = message;
      showToast(message);
    }
  };
  const startTimer = (reset = true) => {
    clearInterval(timerId); if (reset) seconds = 0; $('#timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    timerId = setInterval(() => { seconds += 1; $('#timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }, 1000);
  };
  const prepareQuestion = () => {
    const total = questions.length;
    $('#question-number').textContent = String(questionIndex + 1).padStart(2, '0');
    $('#question-total').textContent = String(total).padStart(2, '0');
    $('#question-text').textContent = questions[questionIndex];
    $('#question-progress').style.width = `${((questionIndex + 1) / total) * 100}%`;
    $('#answer-input').value = '';
    liveTranscript = '';
    renderLiveTranscript('');
    renderEvaluation(null);
    $('#answer-status').textContent = 'Answer when you’re ready';
    $('[data-action="next-question"]').innerHTML = questionIndex === total - 1 ? 'Finish interview <span>✓</span>' : 'Submit answer <span>→</span>';
    renderQuestionNavigation();
    speakQuestion();
  };
  const stopSpeech = () => {
    speechToken += 1;
    if (ttsSupported) window.speechSynthesis.cancel();
    currentUtterance = undefined;
    aiSpeaking = false;
    speechPaused = false;
    $('#speech-indicator')?.classList.remove('active');
    $('#interview-view')?.classList.remove('ai-speaking');
    $('#speech-label').textContent = ttsSupported ? 'AI voice is ready' : 'Speech output unavailable — read the text above';
  };
  const populateSpeechVoices = () => {
    if (!ttsSupported) return;
    speechVoices = window.speechSynthesis.getVoices();
    const select = $('#speech-voice');
    if (!select) return;
    const language = speechLanguage().toLowerCase().split('-')[0];
    const preferred = speechVoices.filter((voice) => voice.lang.toLowerCase().startsWith(language));
    select.innerHTML = '<option value="">Default voice</option>' + preferred.map((voice) => `<option value="${escapeHtml(voice.voiceURI)}">${escapeHtml(voice.name)} (${escapeHtml(voice.lang)})</option>`).join('');
  };
  const selectedSpeechVoice = () => {
    const uri = $('#speech-voice')?.value;
    return speechVoices.find((voice) => voice.voiceURI === uri) || speechVoices.find((voice) => voice.lang.toLowerCase().startsWith(speechLanguage().toLowerCase().split('-')[0])) || speechVoices[0];
  };
  const speakText = (text, kind = 'question') => {
    if (!ttsSupported || interviewerVoiceMuted || !text?.trim()) return false;
    const token = ++speechToken;
    window.speechSynthesis.cancel();
    currentUtterance = undefined;
    speechPaused = false;
    const utterance = new SpeechSynthesisUtterance(text.trim());
    currentUtterance = utterance;
    utterance.lang = speechLanguage();
    utterance.rate = speechRate;
    utterance.volume = speechVolume;
    const voice = selectedSpeechVoice();
    if (voice) utterance.voice = voice;
    utterance.onstart = () => {
      if (token !== speechToken) return;
      aiSpeaking = true;
      stopRecognition(true);
      $('#speech-label').textContent = kind === 'feedback' ? 'AI interviewer is giving feedback' : 'AI interviewer is speaking';
      $('#ai-state').textContent = 'AI speaking';
      $('#speech-indicator').classList.add('active');
      $('#interview-view').classList.add('ai-speaking');
    };
    utterance.onerror = () => {
      if (token !== speechToken) return;
      currentUtterance = undefined;
      aiSpeaking = false;
      $('#speech-label').textContent = 'Speech could not be played — read the text above';
      $('#ai-state').textContent = 'Ready for answer';
      $('#speech-indicator').classList.remove('active');
      $('#interview-view').classList.remove('ai-speaking');
    };
    utterance.onend = () => {
      if (token !== speechToken) return;
      currentUtterance = undefined;
      aiSpeaking = false;
      speechPaused = false;
      $('#speech-label').textContent = modeIsVoice() ? 'Ready — click Start Speaking' : 'AI voice is ready';
      $('#ai-state').textContent = micOn ? 'Microphone ON' : 'Ready for answer';
      $('#speech-indicator').classList.remove('active');
      $('#interview-view').classList.remove('ai-speaking');
    };
    window.speechSynthesis.speak(utterance);
    return true;
  };
  const speakQuestion = () => {
    speakText(questions[questionIndex], 'question');
  };
  const stopRecognition = (manual = false) => {
    recognitionPaused = manual;
    if (recognition && (recognizing || speechStarting)) {
      recognition.stop();
    }
    recognizing = false;
    speechStarting = false;
    $('#speech-indicator')?.classList.remove('active');
  };
  const requestMic = async () => {
    if (micStream) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast('Microphone access is not supported in this browser.');
      return false;
    }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micOn = true;
      updateMedia();
      startAudioVisualizer();
      return true;
    } catch (error) {
      micOn = false;
      updateMedia();
      showToast(error.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'Microphone could not be started.');
      return false;
    }
  };
  const disableMic = () => {
    stopRecognition(true);
    if (micStream) micStream.getTracks().forEach((track) => track.stop());
    micStream = undefined;
    micOn = false;
    updateMedia();
  };
  const setupSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      speechSupported = false;
      $('#speech-label').textContent = 'Speech unavailable — use text input';
      $('#answer-status').textContent = 'Text Interview fallback';
      $('[data-action="start-speaking"]')?.setAttribute('disabled', 'true');
      $('[data-action="stop-speaking"]')?.setAttribute('disabled', 'true');
      showToast('Speech input is not supported in this browser. Text input is available.');
      return false;
    }
    speechSupported = true;
    if (!recognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = sessionConfig.language === 'Hindi' ? 'hi-IN' : sessionConfig.language === 'Hinglish' ? 'en-IN' : 'en-US';
      recognition.onstart = () => { speechStarting = false; recognizing = true; $('#speech-label').textContent = 'LIVE LISTENING — speak now'; $('#answer-status').textContent = 'Listening…'; $('#speech-indicator').classList.add('active'); $('#ai-state').textContent = 'LIVE LISTENING'; };
      recognition.onend = () => {
        speechStarting = false;
        recognizing = false;
        $('#speech-indicator').classList.remove('active');
        if (micOn && !recognitionPaused && !aiSpeaking && !processingAnswer && !paused) {
          $('#speech-label').textContent = 'Listening…';
          setTimeout(() => { if (micOn && !recognitionPaused && !recognizing && !aiSpeaking && !processingAnswer && !paused) startRecognition(); }, 250);
        } else {
          $('#speech-label').textContent = 'Ready — click Start Speaking';
        }
        $('#answer-status').textContent = liveTranscript ? 'Transcript ready to submit' : 'Answer when you’re ready';
        $('#ai-state').textContent = micOn ? 'Microphone ON' : 'Microphone OFF';
      };
      recognition.onerror = (event) => {
        speechStarting = false;
        recognizing = false;
        $('#speech-indicator').classList.remove('active');
        $('#ai-state').textContent = 'Ready for answer';
        const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Microphone permission was denied. Allow access or use the text fallback.'
          : event.error === 'no-speech' ? 'No speech detected. Click Start Speaking to try again.' : 'Speech input stopped. You can continue typing.';
        $('#speech-label').textContent = 'Ready — click Start Speaking';
        $('#answer-status').textContent = message;
        showToast(message);
      };
      recognition.onresult = (event) => {
        let interim = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const text = event.results[index][0].transcript;
          if (event.results[index].isFinal) { liveTranscript = `${liveTranscript} ${text}`.trim(); }
          else interim += text;
        }
        const transcript = `${liveTranscript} ${interim}`.trim();
        $('#answer-input').value = transcript;
        renderLiveTranscript(transcript);
        $('#answer-status').textContent = interim ? 'Listening… edit the transcript if needed' : 'Transcription captured';
      };
    }
    recognition.lang = speechLanguage();
    return true;
  };
  const startRecognition = async () => {
    if (!setupSpeechRecognition() || recognizing || speechStarting || processingAnswer || paused || aiSpeaking) return;
    if (!await requestMic()) return;
    recognitionPaused = false;
    stopSpeech();
    liveTranscript = $('#answer-input').value.trim();
    speechStarting = true;
    try { recognition.start(); } catch (error) {
      speechStarting = false;
      if (error.name !== 'InvalidStateError') showToast('Could not start speech input. You can continue typing.');
    }
  };
  const waitForFeedbackContinue = () => new Promise((resolve) => {
    feedbackContinueResolve = resolve;
    $('#feedback-continue')?.focus();
  });
  const renderQuestionNavigation = () => {
    const navigation = $('#question-navigation');
    if (!navigation) return;
    navigation.innerHTML = questions.map((question, index) => {
      const state = index === questionIndex ? 'current' : answers[index] ? 'completed' : 'pending';
      return `<button type="button" class="${state}" data-action="jump-question" data-question-index="${index}" aria-label="Question ${index + 1}">${index + 1}</button>`;
    }).join('');
  };
  const ensureInterviewControls = () => {
    const indicator = $('#speech-indicator');
    if (indicator && !$('#mic-visualizer')) {
      const visualizer = document.createElement('span');
      visualizer.id = 'mic-visualizer';
      visualizer.className = 'mic-visualizer';
      indicator.appendChild(visualizer);
    }
  };
  const jumpToQuestion = (index) => {
    if (processingAnswer || index < 0 || index >= questions.length) return;
    questionIndex = index;
    prepareQuestion();
    if (answers[index]) $('#answer-input').value = answers[index];
    if (evaluations[index]) renderEvaluation(evaluations[index]);
    renderQuestionNavigation();
  };
  const renderFeedback = (analysis = finalAnalysis) => {
    if (analysis) finalAnalysis = analysis;
    const evaluated = analysis?.question_analysis?.length ? analysis.question_analysis : evaluations.filter(Boolean);
    if (analysis) {
      $('#retry-analysis')?.classList.add('hidden');
      $('#feedback-score').innerHTML = analysis.overall_score == null ? '—<span>/100</span>' : `${Math.round(analysis.overall_score)}<span>/100</span>`;
      $('#feedback-ring').textContent = analysis.overall_score == null ? '—' : Math.round(analysis.overall_score);
      $('#feedback-summary').textContent = analysis.summary || analysis.readiness_assessment || 'Analysis completed.';
      $('#feedback-strengths').textContent = (analysis.overall_strengths || []).join(' · ') || 'No verified strengths returned.';
      $('#feedback-improvements').textContent = (analysis.overall_weaknesses || []).join(' · ') || 'No verified weaknesses returned.';
      const detailedItems = (analysis.question_analysis || []).filter((item) => item.score != null);
      const averageBreakdown = (key, maximum) => detailedItems.length ? Math.round(detailedItems.reduce((sum, item) => sum + Number(item.score_breakdown?.[key] || 0), 0) / detailedItems.length / maximum * 100) : null;
      [['#communication-score', averageBreakdown('communication', 15)], ['#technical-score', averageBreakdown('accuracy', 30)], ['#confidence-score', averageBreakdown('depth', 15)]].forEach(([selector, score]) => {
        $(selector).textContent = score == null ? '—' : `${score}%`;
        $(selector).nextElementSibling.querySelector('em').style.width = score == null ? '0%' : `${score}%`;
      });
    }
    if (!analysis && !evaluated.length) {
      $('#feedback-score').innerHTML = '—<span>/100</span>';
      $('#feedback-ring').textContent = '—';
      $('#feedback-summary').textContent = analysisError || 'AI evaluation was unavailable for this session.';
      $('#feedback-strengths').textContent = 'No verified strengths available.';
      $('#feedback-improvements').textContent = 'Use Retry Analysis after fixing the reported provider error.';
      let retry = $('#retry-analysis');
      if (!retry) {
        retry = document.createElement('button');
        retry.id = 'retry-analysis';
        retry.type = 'button';
        retry.className = 'button button-secondary';
        retry.dataset.action = 'retry-analysis';
        retry.textContent = 'Retry Analysis';
        $('#feedback-summary').after(retry);
      }
      retry.classList.remove('hidden');
      ['#communication-score', '#technical-score', '#confidence-score'].forEach((selector) => { $(selector).textContent = '—'; $(selector).nextElementSibling.querySelector('em').style.width = '0%'; });
    } else if (!analysis) {
      $('#retry-analysis')?.classList.add('hidden');
      const average = evaluated.reduce((sum, item) => sum + Number(item.score), 0) / evaluated.length;
      const overall = Math.round(average * 10);
      const communication = Math.round(evaluated.reduce((sum, item) => sum + Number(item.criteria.communication), 0) / evaluated.length * 10);
      const technical = Math.round(evaluated.reduce((sum, item) => sum + Number(item.criteria.technical_accuracy), 0) / evaluated.length * 10);
      const completeness = Math.round(evaluated.reduce((sum, item) => sum + Number(item.criteria.completeness), 0) / evaluated.length * 10);
      $('#feedback-score').innerHTML = `${overall}<span>/100</span>`; $('#feedback-ring').textContent = overall;
      $('#communication-score').textContent = `${communication}%`; $('#technical-score').textContent = `${technical}%`; $('#confidence-score').textContent = `${completeness}%`;
      $('#communication-score').nextElementSibling.querySelector('em').style.width = `${communication}%`;
      $('#technical-score').nextElementSibling.querySelector('em').style.width = `${technical}%`;
      $('#confidence-score').nextElementSibling.querySelector('em').style.width = `${completeness}%`;
      $('#feedback-summary').textContent = `Verified average answer score: ${average.toFixed(1)}/10.`;
      $('#feedback-strengths').textContent = [...new Set(evaluated.flatMap((item) => item.strengths || []))].slice(0, 3).join(' · ');
      $('#feedback-improvements').textContent = [...new Set(evaluated.flatMap((item) => item.missing_key_points || []))].slice(0, 3).join(' · ');
    }
    $('#result-meta').textContent = `${sessionConfig.language || 'English'} · ${sessionConfig.mode || 'Text'} · ${answers.length} answers`;
    const plan = finalAnalysis?.improvement_plan;
    const overallDetails = finalAnalysis?.overall_details || {};
    const reportDetails = finalAnalysis ? `<div class="final-report-details"><b>Performance</b><p>${escapeHtml(finalAnalysis.performance_level)} · ${escapeHtml(finalAnalysis.readiness_assessment)}</p><b>Strongest answer</b><p>${escapeHtml(overallDetails.strongest_answer)}</p><b>Weakest answer</b><p>${escapeHtml(overallDetails.weakest_answer)}</p><b>Technically impressive</b><p>${escapeHtml(overallDetails.most_technically_impressive_answer)}</p><b>Common mistakes</b>${listHtml(overallDetails.common_mistakes)}<b>Knowledge gaps</b>${listHtml(overallDetails.repeated_knowledge_gaps)}<b>Top priorities</b>${listHtml(plan?.top_areas)}<b>Topics to revise</b>${listHtml(plan?.topics_to_revise)}<b>Preparation plan</b>${listHtml(plan?.preparation_plan)}<b>Practice questions</b>${listHtml(plan?.practice_questions)}<b>Next interview</b><p>${escapeHtml(plan?.recommended_next_interview)}</p><button class="button button-secondary" type="button" data-action="practice-weak">Practice Weak Questions</button></div>` : '';
    const questionDetails = finalAnalysis?.question_analysis?.map((item, index) => {
      const breakdown = item.score_breakdown || {};
      const practice = practiceResults[index];
      return `<details class="question-report"><summary><span>Question ${item.question_number || index + 1}: ${escapeHtml(item.question || questions[index])}</span><strong>${item.score == null ? 'Not scored' : `${item.score}/100`} · ${escapeHtml(item.performance_level || 'Pending')}</strong></summary><div class="question-report-body"><p><b>Original question</b><br>${escapeHtml(item.question || questions[index])}</p><p><b>Candidate answer</b><br>${escapeHtml(item.candidate_answer || answers[index] || 'No answer submitted')}</p><div class="score-breakdown">${[['Relevance', breakdown.relevance, 20], ['Accuracy', breakdown.accuracy, 30], ['Completeness', breakdown.completeness, 20], ['Depth', breakdown.depth, 15], ['Communication', breakdown.communication, 15]].map(([label, value, max]) => `<span>${label}<b>${value ?? '—'}/${max}</b></span>`).join('')}</div><b>Strengths</b>${listHtml(item.strengths)}<b>Mistakes and weaknesses</b>${listHtml(item.mistakes_and_weaknesses)}<b>Missing concepts</b>${listHtml(item.missing_concepts)}<b>What the interviewer expected</b><p>${escapeHtml(item.interviewer_expected)}</p><b>Why this score</b><p>${escapeHtml(item.score_explanation)}</p><b>Actionable improvements</b>${listHtml(item.actionable_improvements)}<b>Ideal answer</b><p>${escapeHtml(item.ideal_answer)}</p><b>Follow-up question</b><p>${escapeHtml(item.follow_up_question)}</p><b>Personalized recommendation</b><p>${escapeHtml(item.personalized_recommendation)}</p><button class="button button-secondary" type="button" data-action="practice-question" data-question-index="${index}">Practice This Question Again</button>${practice ? `<div class="practice-comparison"><b>Practice comparison</b><p>Previous: ${item.score ?? '—'}/100 · New: ${practice.score}/100 · Change: ${practice.delta >= 0 ? '+' : ''}${practice.delta}</p><p>${escapeHtml(practice.feedback)}</p></div>` : ''}</div></details>`;
    }).join('') || '';
    const basicTranscript = answers.map((answer, index) => {
      const item = finalAnalysis?.question_analysis?.[index] || evaluations[index];
      return `<p><b>Question ${index + 1}</b>${answer}${item?.score != null ? ` <small>Score ${item.score}/10</small>` : ' <small>AI evaluation unavailable</small>'}</p>`;
    }).join('');
    $('#transcript-list').innerHTML = answers.length ? reportDetails + (finalAnalysis ? questionDetails : basicTranscript) : '<p>No answers were submitted.</p>';
  };
  const setInterviewSetupStatus = (message, isError = false) => {
    const status = $('#interview-setup-status');
    if (status) {
      status.textContent = message;
      status.classList.toggle('error-state', isError);
    }
  };
  const showInterviewPreparation = (message) => {
    let panel = $('#interview-preparation');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'interview-preparation';
      panel.className = 'interview-preparation';
      panel.setAttribute('role', 'status');
      panel.setAttribute('aria-live', 'polite');
      panel.innerHTML = '<div class="preparation-card"><span class="preparation-orb">✦</span><p class="eyebrow">INTERVEXA AI</p><h2>Preparing your interview</h2><p id="interview-preparation-message"></p><span class="preparation-loader" aria-hidden="true"></span><button class="button button-quiet" type="button" data-action="cancel-interview-start">Cancel</button></div>';
      document.body.appendChild(panel);
    }
    $('#interview-preparation-message').textContent = message;
    panel.classList.remove('hidden');
  };
  const hideInterviewPreparation = () => $('#interview-preparation')?.classList.add('hidden');
  const startInterview = async () => {
    if (interviewInitializationInFlight || interviewSessionState === 'active' || processingAnswer || analysisInFlight) return;
    interviewInitializationInFlight = true;
    interviewSessionState = 'initializing';
    const initializationToken = ++interviewInitializationToken;
    const startButton = $('.start-configured');
    if (startButton) startButton.disabled = true;
    setInterviewSetupStatus('Preparing a fresh session…');
    showInterviewPreparation('Validating your settings and loading the first question…');
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (initializationToken !== interviewInitializationToken) return;
    const role = $('#role').value.trim() || 'your target role';
    const countValue = $('#question-count').value;
    const count = countValue === 'Custom' ? Math.min(50, Math.max(1, Number.parseInt($('#custom-question-count').value, 10) || 5)) : Number.parseInt(countValue, 10) || 5;
    const projectQuestions = selectedProjectCategories.map((category) => projectPrompts[category]);
    const initialQuestions = (projectMode ? projectQuestions : [prompts[selectedType], `How would your approach change as a ${role} at a growing company?`, 'Tell me about a time your first approach did not work. What did you learn?', 'How do you prioritize when several important tasks compete for your attention?', 'How do you keep stakeholders informed when plans change?', 'What trade-offs do you consider when choosing an approach?', 'Tell me about a result you improved and how you measured it.', 'How do you learn a new skill quickly?', 'What would your teammates say you contribute most often?', 'What questions would you ask us before joining this team?']).slice(0, count);
    if (!initialQuestions.length || !initialQuestions[0]?.trim()) {
      interviewInitializationInFlight = false;
      interviewSessionState = 'idle';
      if (startButton) startButton.disabled = false;
      hideInterviewPreparation();
      setInterviewSetupStatus('Could not load a first question. Please review your settings and try again.', true);
      return;
    }
    questions = initialQuestions;
    sessionConfig = {
      role,
      experience: $('#experience').value,
      difficulty: $('#difficulty').value,
      duration: $('#duration').value,
      language: $('#language').value,
      personality: $('#personality').value,
      mode: $('#mode').value,
      feedbackMode: $('#feedback-mode').value,
      topics: [...$('#topics').selectedOptions].map((option) => option.value).join(', '),
      company: $('#company').value.trim(),
      instructions: $('#instructions').value.trim(),
      type: selectedType
    };
    answers = [];
    evaluations = [];
    finalAnalysis = undefined;
    analysisError = '';
    practiceResults = {};
    analysisInFlight = false;
    conversation = [];
    processingAnswer = false;
    paused = false;
    interviewerVoiceMuted = false;
    recognitionPaused = false;
    $('[data-action="toggle-interviewer-voice"]').textContent = '🔊 Interviewer voice';
    speechSupported = false;
    ttsSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    speechRate = Number.parseFloat($('#speech-rate')?.value || '0.94');
    speechVolume = Number.parseFloat($('#speech-volume')?.value || '1');
    speechPaused = false;
    populateSpeechVoices();
    $('#conversation-history').innerHTML = '<p class="conversation-empty">Your conversation will appear here.</p>';
    $('#interview-title').innerHTML = `${selectedType} <span>·</span> ${role}`;
    ensureInterviewControls();
    if (!$('[data-action="toggle-mic"]')) {
      const micButton = document.createElement('button');
      micButton.className = 'control-button';
      micButton.type = 'button';
      micButton.dataset.action = 'toggle-mic';
      micButton.innerHTML = '♩ <span>Microphone OFF</span>';
      $('.media-controls').prepend(micButton);
    }
    $('#ai-state').textContent = 'AI is preparing the first question';
    questionIndex = 0;
    if (!questions[questionIndex]) {
      throw new Error('The first interview question could not be initialized.');
    }
    interviewSessionState = 'active';
    persistInterviewProgress();
    interviewInitializationInFlight = false;
    if (startButton) startButton.disabled = false;
    hideInterviewPreparation();
    showView('interview-view');
    prepareQuestion();
    startTimer();
    updateModeSwitch();
    appendConversation('AI interviewer', questions[0]);
    if (modeIsVoice()) {
      setupSpeechRecognition();
      if (modeIsCamera() || $('#camera-preference').checked) requestMedia();
      else updateMedia();
    } else {
      $('#speech-label').textContent = 'Text mode is active';
      $('#answer-status').textContent = 'Type your answer below';
    }
  };
  const beginInterview = async () => {
    try {
      await startInterview();
    } catch (error) {
      interviewInitializationInFlight = false;
      interviewSessionState = 'idle';
      $('.start-configured')?.removeAttribute('disabled');
      hideInterviewPreparation();
      setInterviewSetupStatus(error.message || 'Interview setup failed. Please try again.', true);
      showToast(error.message || 'Interview setup failed. Please try again.');
    }
  };
  const resumeInterview = () => {
    const progress = readInterviewProgress();
    if (!progress) return false;
    sessionConfig = progress.config || {};
    questions = progress.questions;
    answers = Array.isArray(progress.answers) ? progress.answers : [];
    evaluations = Array.isArray(progress.evaluations) ? progress.evaluations : [];
    conversation = Array.isArray(progress.conversation) ? progress.conversation : [];
    questionIndex = Math.min(Number(progress.questionIndex) || 0, questions.length - 1);
    seconds = Number(progress.seconds) || 0;
    finalAnalysis = undefined;
    projectMode = false;
    interviewSessionState = 'active';
    showView('interview-view');
    ensureInterviewControls();
    $('#interview-title').innerHTML = `${escapeHtml(sessionConfig.type || 'Interview')} <span>·</span> ${escapeHtml(sessionConfig.role || 'Practice session')}`;
    $('#conversation-history').innerHTML = '<p class="conversation-empty">Your conversation will appear here.</p>';
    conversation.forEach((entry) => appendConversation(entry.speaker, entry.text));
    prepareQuestion();
    startTimer(false);
    updateModeSwitch();
    return true;
  };
  const completeInterview = async (retry = false) => {
    if (analysisInFlight || (!retry && interviewSessionState !== 'active') || !questions.length) return;
    interviewSessionState = 'completing';
    analysisInFlight = true;
    clearInterval(timerId);
    stopSpeech();
    stopMedia();
    showView('feedback-view');
    $('#feedback-summary').textContent = 'Analyzing your complete interview transcript…';
    $('#feedback-score').innerHTML = '…<span>/100</span>';
    const analysis = await requestFinalAnalysis();
    if (analysis) {
      saveInterviewReport(analysis);
      renderFeedback(analysis);
    } else {
      renderFeedback();
    }
    speakText('Interview complete. Your detailed report is ready on screen.', 'feedback');
    analysisInFlight = false;
    interviewSessionState = 'completed';
  };
  const practiceQuestion = (index) => {
    const item = finalAnalysis?.question_analysis?.[index];
    if (!item) return;
    let panel = $('#focused-practice-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'focused-practice-panel';
      panel.className = 'panel focused-practice-panel';
      $('#feedback-view').appendChild(panel);
    }
    panel.innerHTML = `<p class="eyebrow">FOCUSED PRACTICE</p><h3>Question ${item.question_number || index + 1}</h3><p>${escapeHtml(item.question || questions[index])}</p><textarea id="practice-answer-input" rows="5" placeholder="Write a stronger answer..."></textarea><div class="practice-actions"><button class="button button-primary" type="button" data-action="submit-practice" data-question-index="${index}">Evaluate New Answer</button><button class="button button-quiet" type="button" data-action="close-practice">Close</button></div><p id="practice-status">Your original score: ${item.score ?? '—'}/100</p>`;
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#practice-answer-input').focus();
  };
  const practiceWeakQuestion = () => {
    const items = finalAnalysis?.question_analysis || [];
    if (!items.length) return;
    const index = items.reduce((weakestIndex, item, currentIndex) => (
      item.score != null && (items[weakestIndex]?.score == null || item.score < items[weakestIndex].score) ? currentIndex : weakestIndex
    ), 0);
    practiceQuestion(index);
  };
  const submitPractice = async (index) => {
    const answerInput = $('#practice-answer-input');
    const item = finalAnalysis?.question_analysis?.[index];
    if (!answerInput || !item) return;
    const answer = answerInput.value.trim();
    if (!answer) {
      showToast('Write a new answer before evaluating it.');
      return;
    }
    $('#practice-status').textContent = 'AI is comparing your new answer…';
    const evaluation = await requestEvaluation(item.question || questions[index], answer);
    if (!evaluation) {
      $('#practice-status').textContent = 'Practice evaluation failed. Fix the provider and try again.';
      return;
    }
    const score = Math.round(Number(evaluation.score) * 10);
    const previous = Number(item.score);
    practiceResults[index] = {
      answer,
      score,
      delta: Number.isFinite(previous) ? score - previous : score,
      feedback: `${(evaluation.strengths || []).join(' ')} ${(evaluation.improvement_advice || '')}`.trim()
    };
    const reports = readStoredReports();
    if (reports[0]) {
      reports[0].practiceResults = practiceResults;
      writeStoredReports(reports);
    }
    renderFeedback(finalAnalysis);
    practiceQuestion(index);
    $('#practice-status').textContent = `New score: ${score}/100 (${practiceResults[index].delta >= 0 ? '+' : ''}${practiceResults[index].delta}).`;
  };
  const submitAnswer = async () => {
    if (processingAnswer || paused) return;
    const answer = $('#answer-input').value.trim();
    if (!answer && sessionConfig.mode === 'Text Interview') { showToast('Add an answer before continuing.'); return; }
    if (!answer) return;
    processingAnswer = true;
    stopRecognition(true);
    stopSpeech();
    renderLiveTranscript('');
    answers[questionIndex] = answer;
    persistInterviewProgress();
    appendConversation('You', answer, true);
    $('#answer-status').textContent = 'AI is considering your answer…';
    $('#speech-label').textContent = 'Processing answer…';
    $('#ai-state').textContent = 'AI is thinking';
    const evaluation = await requestEvaluation(questions[questionIndex], answer);
    if (!evaluation) {
      $('#answer-status').textContent = 'AI evaluation failed. Fix the provider configuration and retry this answer.';
      $('#ai-state').textContent = 'AI unavailable';
      processingAnswer = false;
      return;
    }
    evaluations[questionIndex] = evaluation;
    renderEvaluation(sessionConfig.feedbackMode === 'After every question' ? evaluation : null);
    if (sessionConfig.feedbackMode === 'After every question' && evaluation) {
      const feedbackText = `Score ${evaluation.score} out of 10. ${(evaluation.strengths || [])[0] || ''} ${(evaluation.improvement_advice || '').split('.').shift()}.`;
      speakText(feedbackText, 'feedback');
      await waitForFeedbackContinue();
    }
    const aiQuestion = evaluation.next_question || await requestAIResponse(answer);
    if (!aiQuestion && questionIndex < questions.length - 1) {
      $('#answer-status').textContent = 'AI follow-up generation failed. Fix the provider configuration and retry.';
      $('#ai-state').textContent = 'AI unavailable';
      processingAnswer = false;
      return;
    }
    if (questionIndex < questions.length - 1) {
      questionIndex += 1;
      if (aiQuestion) questions[questionIndex] = aiQuestion;
      prepareQuestion();
      appendConversation('AI interviewer', questions[questionIndex]);
      renderQuestionNavigation();
      $('#ai-state').textContent = micOn ? 'Microphone ON' : 'Ready for answer';
    } else {
      await completeInterview();
    }
    processingAnswer = false;
  };

  document.addEventListener('click', (event) => {
    const navLink = event.target.closest('.nav-links a[data-nav]');
    if (navLink) {
      event.preventDefault();
      navigateToSection(navLink.dataset.nav, navLink);
      $('.nav-links')?.classList.remove('open');
      $('.mobile-menu')?.setAttribute('aria-expanded', 'false');
      return;
    }
    const flipCard = event.target.closest('[data-flip-card]');
    if (flipCard && !event.target.closest('button')) {
      flipCard.classList.toggle('is-flipped');
      flipCard.setAttribute('aria-expanded', String(flipCard.classList.contains('is-flipped')));
      return;
    }
    if (event.target.closest('#demo-modal') && event.target === $('#demo-modal')) {
      closeDemo();
      return;
    }
    const questionSummary = event.target.closest('.project-question-summary');
    if (questionSummary) {
      const card = questionSummary.closest('.project-question-card');
      const details = card?.querySelector('.project-question-details');
      const expanded = questionSummary.getAttribute('aria-expanded') === 'true';
      questionSummary.setAttribute('aria-expanded', String(!expanded));
      details?.classList.toggle('hidden', expanded);
      return;
    }
    const target = event.target.closest('[data-action], [data-type-option], [data-project-category], [data-project-map-category], [data-question-action], [data-auth-view]');
    if (!target) return;
    if (target.dataset.projectMapCategory) {
      selectedProjectQuestionCategory = target.dataset.projectMapCategory;
      renderCategories();
      generateProjectQuestions(false);
      return;
    }
    if (target.dataset.questionAction) {
      const card = target.closest('.project-question-card');
      const item = card ? (projectQuestionBank[selectedProjectQuestionCategory] || []).find((entry) => entry.id === card.dataset.questionId) : projectPracticeQuestion;
      const action = target.dataset.questionAction;
      if (action === 'close-practice') { $('#project-practice-panel')?.remove(); return; }
      if (action === 'practice' && item) { openProjectPractice(item); return; }
      if (action === 'reveal-answer' && card) { card.querySelector('.question-answer-reveal')?.classList.toggle('hidden'); return; }
      if (action === 'reveal-expectations' && card) { card.querySelector('.question-expectations')?.classList.toggle('hidden'); return; }
      if ((action === 'toggle-completed' || action === 'toggle-difficult') && item) {
        item[action === 'toggle-completed' ? 'completed' : 'difficult'] = !item[action === 'toggle-completed' ? 'completed' : 'difficult'];
        saveProjectState(); renderCategories(); renderProjectQuestionBank(); return;
      }
      if (action === 'toggle-bookmark' && item) {
        item.bookmarked = !item.bookmarked;
        saveProjectState(); renderProjectQuestionBank(); return;
      }
      if (action === 'submit-practice' && projectPracticeQuestion) {
        const answer = $('#project-practice-answer')?.value.trim();
        const result = $('#project-practice-result');
        if (!answer) { showToast('Write or speak an answer before evaluating.'); return; }
        result.innerHTML = '<p class="question-bank-status">Gemini is evaluating this answer…</p>';
        evaluateProjectAnswer(projectPracticeQuestion, answer).then((evaluation) => {
          projectPracticeAttempts.push({ questionId: projectPracticeQuestion.id, category: projectPracticeQuestion.category, question: projectPracticeQuestion.question, answer, evaluation, createdAt: new Date().toISOString() });
          saveProjectState();
          result.innerHTML = `<div class="project-evaluation"><strong>${escapeHtml(evaluation.score)}/10</strong><p><b>Accuracy:</b> ${escapeHtml(evaluation.accuracy)}</p><p><b>Technical depth:</b> ${escapeHtml(evaluation.technical_depth)}</p><p><b>Clarity:</b> ${escapeHtml(evaluation.clarity)}</p><p><b>Missing concepts:</b> ${escapeHtml(evaluation.missing_concepts)}</p><p><b>Strengths:</b> ${escapeHtml(evaluation.strengths)}</p><p><b>How to improve:</b> ${escapeHtml(evaluation.improvement)}</p><p><b>Ideal answer:</b> ${escapeHtml(evaluation.ideal_answer)}</p></div>`;
        }).catch((error) => { result.innerHTML = `<p class="error-state">${escapeHtml(error.message)}</p>`; });
        return;
      }
      if (action === 'start-practice-speaking') {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) { showToast('Speech recognition is not supported in this browser. Type your answer instead.'); return; }
        projectPracticeRecognition?.stop();
        projectPracticeRecognition = new SpeechRecognition();
        projectPracticeRecognition.lang = 'en-IN';
        projectPracticeRecognition.interimResults = true;
        projectPracticeRecognition.onresult = (recognitionEvent) => {
          const text = [...recognitionEvent.results].map((result) => result[0].transcript).join(' ');
          $('#project-practice-answer').value = text;
        };
        projectPracticeRecognition.onerror = () => showToast('Microphone input failed. Check permission and try again.');
        projectPracticeRecognition.onend = () => { projectPracticeRecognition = undefined; };
        try { projectPracticeRecognition.start(); showToast('Listening… speak your project answer.'); } catch (error) { showToast('Microphone is already active.'); }
        return;
      }
      return;
    }
    if (target.dataset.projectCategory) {
      const category = target.dataset.projectCategory;
      if (selectedProjectCategories.includes(category)) {
        if (selectedProjectCategories.length === 1) { showToast('Keep at least one question category selected.'); return; }
        selectedProjectCategories = selectedProjectCategories.filter((item) => item !== category);
      } else {
        selectedProjectCategories = [...selectedProjectCategories, category];
      }
      $$('.category-pill, .setup-category').forEach((item) => item.classList.toggle('selected', selectedProjectCategories.includes(item.dataset.projectCategory)));
      $('#project-selection-count').textContent = `${selectedProjectCategories.length} selected`;
      return;
    }
    if (target.dataset.typeOption) {
      selectedType = target.dataset.typeOption; $('#selection-label').textContent = selectedType;
      $$('.type-option').forEach((option) => option.classList.toggle('selected', option.dataset.typeOption === selectedType));
      return;
    }
    const action = target.dataset.action;
    if (target.dataset.authView) { setAuthView(target.dataset.authView); return; }
    if (action === 'close-auth') { closeAuth(); return; }
    if (action === 'close-profile') { $('#profile-modal').classList.add('hidden'); return; }
    if (action === 'toggle-password') {
      const input = document.getElementById(target.dataset.target);
      input.type = input.type === 'password' ? 'text' : 'password';
      target.textContent = input.type === 'password' ? 'Show' : 'Hide';
      return;
    }
    if (action === 'watch-demo') { openDemo(); return; }
    if (action === 'close-demo') { closeDemo(); return; }
    if (action === 'replay-demo') { demoIndex = 0; renderDemo(); startDemo(); return; }
    if (action === 'toggle-demo') {
      if (demoPlaying) { stopDemo(); target.textContent = 'Play demo'; }
      else { startDemo(); }
      return;
    }
    if (action === 'next-demo') { demoIndex = (demoIndex + 1) % demoSteps.length; renderDemo(); return; }
    if (action === 'generate-coding-question') { generateCodingQuestion(); return; }
    if (action === 'evaluate-coding-answer') { evaluateCodingAnswer(); return; }
    if (action === 'refresh-skills') { loadSkills(); return; }
    if (action === 'enter-dashboard') enterDashboard();
    if (action === 'start-setup') { enterDashboard(); projectMode = false; showView('setup-view'); updateProjectSetup(); }
    if (action === 'cancel-interview-start') {
      interviewInitializationToken += 1;
      interviewInitializationInFlight = false;
      interviewSessionState = 'idle';
      $('.start-configured')?.removeAttribute('disabled');
      hideInterviewPreparation();
      setInterviewSetupStatus('');
      return;
    }
    if (action === 'back-dashboard' || action === 'leave-interview') {
      stopSpeech();
      stopMedia();
      clearInterval(timerId);
      if (action === 'leave-interview' && interviewSessionState === 'active') {
        interviewSessionState = 'idle';
        showToast('Interview cancelled. Your incomplete session was not saved.');
      }
      showView('dashboard-view');
    }
    if (action === 'continue-guest') { continueAsGuest(); return; }
    if (action === 'quick-start') { enterDashboard(); projectMode = false; selectedType = target.dataset.type; $('#selection-label').textContent = selectedType; renderCategories(); showView('setup-view'); }
    if (action === 'project-start' || action === 'project-custom') {
      enterDashboard();
      projectMode = true;
      selectedType = action === 'project-custom' ? 'Custom Project Viva' : target.dataset.type;
      $('#selection-label').textContent = selectedType;
      renderCategories();
      showView('setup-view');
    }
    if (action === 'resume') {
      if (resumeInterview()) return;
      const reports = readStoredReports();
      if (reports[0]?.config) {
        projectMode = false;
        selectedType = reports[0].config.type || 'Technical Interview';
        $('#selection-label').textContent = selectedType;
        renderCategories();
        showView('setup-view');
        setInterviewSetupStatus('Your last completed report is available in History. Configure a new session here to practice again.');
      } else {
        enterDashboard();
        showView('setup-view');
        updateProjectSetup();
      }
    }
    if (action === 'profile') {
      if (requireAuth('profile')) return;
      const user = currentUser;
      $('#profile-name').value = user.name || '';
      $('#profile-email').value = user.email || '';
      $('#profile-avatar').value = user.avatar_url || '';
      $('#profile-education').value = user.education || '';
      $('#profile-degree').value = user.degree || '';
      $('#profile-branch').value = user.branch || '';
      $('#profile-experience').value = user.experience_level || '';
      $('#profile-goals').value = user.career_goals || '';
      $('#profile-modal').classList.remove('hidden');
    }
    if (action === 'logout') {
      authRequest('/api/auth/logout', { method: 'POST', body: '{}' }).then(() => { applyUser(null); loadUserHistory(); $('#profile-modal').classList.add('hidden'); showToast('You have been signed out.'); }).catch((error) => showToast(error.message));
    }
    if (action === 'history' || action === 'view-all-history') showToast('Your complete interview history is shown in the activity panel.');
    if (action === 'view-cloud-report') {
      authRequest(`/api/interviews/${target.dataset.reportId}`, { method: 'GET', headers: {} }).then((result) => {
        const report = result.interview;
        questions = report.questions || [];
        answers = report.answers || [];
        evaluations = report.evaluations || [];
        sessionConfig = report.config || {};
        finalAnalysis = report.analysis || undefined;
        renderFeedback(finalAnalysis);
        showView('feedback-view');
      }).catch((error) => showToast(error.message));
    }
    if (action === 'view-report') {
      const reports = readStoredReports();
      const report = reports[0];
      if (!report) {
        showToast('Complete an interview before opening a report.');
      } else {
        questions = report.questions || [];
        answers = report.answers || [];
        evaluations = report.evaluations || [];
        sessionConfig = report.config || {};
        finalAnalysis = report.analysis || undefined;
        practiceResults = report.practiceResults || {};
        renderFeedback(finalAnalysis);
        showView('feedback-view');
      }
    }
    if (action === 'toggle-camera') {
      if (cameraOn) stopCamera(); else requestMedia();
    }
    if (action === 'toggle-mic') { if (micOn) disableMic(); else startRecognition(); }
    if (action === 'toggle-speech' || action === 'start-speaking') startRecognition();
    if (action === 'stop-speaking') stopRecognition(true);
    if (action === 'play-speech') {
      if (speechPaused && ttsSupported) { window.speechSynthesis.resume(); speechPaused = false; }
      else speakQuestion();
    }
    if (action === 'pause-speech') {
      if (ttsSupported && aiSpeaking) { window.speechSynthesis.pause(); speechPaused = true; $('#speech-label').textContent = 'AI speech paused'; }
    }
    if (action === 'stop-speech') stopSpeech();
    if (action === 'repeat-question') speakQuestion();
    if (action === 'jump-question') {
      jumpToQuestion(Number.parseInt(target.dataset.questionIndex, 10));
    }
    if (action === 'continue-after-feedback') {
      $('#answer-evaluation')?.classList.add('hidden');
      feedbackContinueResolve?.();
      feedbackContinueResolve = undefined;
    }
    if (action === 'cycle-mode') {
      if (modeIsVoice()) {
        sessionConfig.mode = 'Text Interview';
        stopRecognition(true);
        stopSpeech();
        $('#speech-label').textContent = 'Text mode is active';
      } else {
        sessionConfig.mode = 'Voice Interview with Live Transcript';
        setupSpeechRecognition();
        speakQuestion();
      }
      updateModeSwitch();
    }
    if (action === 'toggle-interviewer-voice') {
      interviewerVoiceMuted = !interviewerVoiceMuted;
      target.textContent = interviewerVoiceMuted ? '🔇 Interviewer muted' : '🔊 Interviewer voice';
      if (interviewerVoiceMuted) stopSpeech();
      else speakQuestion();
    }
    if (action === 'clear-transcript') { conversation = []; $('#conversation-history').innerHTML = '<p class="conversation-empty">Your conversation will appear here.</p>'; }
    if (action === 'pause-interview') {
      paused = !paused;
      if (paused) { clearInterval(timerId); window.speechSynthesis?.pause(); speechPaused = true; target.textContent = 'Resume interview'; target.classList.add('paused'); $('#ai-state').textContent = 'Interview paused'; }
      else { startTimer(false); window.speechSynthesis?.resume(); speechPaused = false; target.textContent = 'Pause interview'; target.classList.remove('paused'); $('#ai-state').textContent = 'Ready for answer'; }
    }
    if (action === 'clear-answer') $('#answer-input').value = '';
    if (action === 'next-question') submitAnswer();
    if (action === 'end-interview') completeInterview();
    if (action === 'retry-analysis') completeInterview(true);
    if (action === 'practice-question') practiceQuestion(Number(target.dataset.questionIndex));
    if (action === 'practice-weak') practiceWeakQuestion();
    if (action === 'submit-practice') submitPractice(Number(target.dataset.questionIndex));
    if (action === 'close-practice') $('#focused-practice-panel')?.remove();
    if (action === 'generate-project-questions') {
      selectedProjectQuestionCategory = selectedProjectQuestionCategory || projectCategories[0];
      generateProjectQuestions(false);
    }
    if (action === 'regenerate-project-questions') generateProjectQuestions(false);
    if (action === 'generate-more-project-questions') generateProjectQuestions(true);
  });
  document.addEventListener('keydown', (event) => {
    if (event.target.id === 'answer-input' && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitAnswer();
      return;
    }
    if (event.key === 'Escape' && !$('#demo-modal').classList.contains('hidden')) {
      closeDemo();
      return;
    }
    const card = event.target.closest('[data-flip-card]');
    if (card && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      card.classList.toggle('is-flipped');
      card.setAttribute('aria-expanded', String(card.classList.contains('is-flipped')));
    }
  });
  $('#setup-form').addEventListener('submit', (event) => { event.preventDefault(); beginInterview(); });
  $('#resume-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#resume-output').textContent = 'Analyzing your resume with Gemini…';
    try {
      const result = await requestFeature('/api/resume/analyze', { resume_text: $('#resume-text').value, target_role: $('#resume-role').value });
      renderResumeAnalysis(result.analysis);
    } catch (error) { $('#resume-output').innerHTML = `<p class="error-state">${escapeHtml(error.message)}</p>`; }
  });
  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#auth-error').textContent = 'Signing in…';
    try {
      const result = await authRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: $('#login-email').value, password: $('#login-password').value }) });
      applyUser(result.user); await ensureCsrf(); await loadUserHistory(); closeAuth(); showToast(`Welcome back, ${result.user.name.split(' ')[0]}.`); continueAfterAuth();
    } catch (error) { $('#auth-error').textContent = error.message; }
  });
  $('#signup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#auth-error').textContent = 'Creating your account…';
    try {
      const result = await authRequest('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name: $('#signup-name').value, email: $('#signup-email').value, password: $('#signup-password').value }) });
      applyUser(result.user); await ensureCsrf(); await loadUserHistory(); closeAuth(); showToast('Your account is ready.'); continueAfterAuth();
    } catch (error) { $('#auth-error').textContent = error.message; }
  });
  $('#forgot-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#auth-error').textContent = 'Checking your account…';
    try {
      const result = await authRequest('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: $('#forgot-email').value }) });
      $('#auth-error').textContent = result.message;
    } catch (error) { $('#auth-error').textContent = error.message; }
  });
  $('#reset-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#auth-error').textContent = 'Resetting password…';
    try {
      const result = await authRequest('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: $('#reset-token').value, password: $('#reset-password').value }) });
      $('#auth-error').textContent = result.message;
      setAuthView('login');
    } catch (error) { $('#auth-error').textContent = error.message; }
  });
  $('#profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#profile-status').textContent = 'Saving…';
    try {
      const result = await authRequest('/api/profile', { method: 'PUT', body: JSON.stringify({ name: $('#profile-name').value, avatar_url: $('#profile-avatar').value, education: $('#profile-education').value, degree: $('#profile-degree').value, branch: $('#profile-branch').value, experience_level: $('#profile-experience').value, career_goals: $('#profile-goals').value, preferred_categories: currentUser.preferred_categories || [] }) });
      applyUser(result.user); $('#profile-status').textContent = 'Profile saved.';
    } catch (error) { $('#profile-status').textContent = error.message; }
  });
  $('#question-count').addEventListener('change', (event) => $('#custom-question-count-label').classList.toggle('hidden', event.target.value !== 'Custom'));
  $('#career-coach-form').addEventListener('submit', generateCareerRoadmap);
  $('#career-chat-form').addEventListener('submit', sendCareerMessage);
  $('#speech-rate').addEventListener('input', (event) => { speechRate = Number.parseFloat(event.target.value); });
  $('#speech-volume').addEventListener('input', (event) => { speechVolume = Number.parseFloat(event.target.value); });
  $('#speech-voice').addEventListener('change', () => { if (aiSpeaking) speakQuestion(); });
  $('#project-question-search').addEventListener('input', (event) => { projectQuestionSearch = event.target.value; renderProjectQuestionBank(); });
  $('#project-question-filter').addEventListener('change', (event) => { projectQuestionFilter = event.target.value; renderProjectQuestionBank(); });
  $('#resume').addEventListener('change', (event) => { const name = event.target.files[0]?.name; if (name) event.target.nextElementSibling.innerHTML = `${name} <b>Change</b>`; });
  $('.mobile-menu').addEventListener('click', (event) => { const open = $('.nav-links').classList.toggle('open'); event.currentTarget.setAttribute('aria-expanded', String(open)); });
  $('#orb-stage').addEventListener('pointermove', (event) => { const rect = event.currentTarget.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width - .5; const y = (event.clientY - rect.top) / rect.height - .5; $('.ai-orb').style.transform = `rotateY(${x * 18}deg) rotateX(${y * -18}deg) translateZ(8px)`; });
  $('#orb-stage').addEventListener('pointerleave', () => { $('.ai-orb').style.transform = ''; });
  $('#product-showcase').addEventListener('pointermove', (event) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    event.currentTarget.style.transform = `rotateY(${x * 8}deg) rotateX(${y * -6}deg) translateY(-4px)`;
  });
  $('#product-showcase').addEventListener('pointerleave', (event) => { event.currentTarget.style.transform = ''; });
  $('#cinematic-intro').classList.remove('dismissed');
  document.body.classList.add('intro-active');
  sessionConfig.type = selectedType;
  if (ttsSupported) {
    window.speechSynthesis.onvoiceschanged = populateSpeechVoices;
    populateSpeechVoices();
  }
  renderCategories();
  loadAuthSession();
  loadSkills();
})();
