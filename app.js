const chapterNames = {
  1: 'Sección general', 2: 'Organización y auxiliares', 3: 'Reglas procesales generales',
  4: 'Procedimientos civiles', 5: 'Familia', 6: 'Laboral', 7: 'Penal',
  8: 'Cortes de Apelaciones', 9: 'Corte Suprema'
};

const state = {
  bank: [],
  attempt: null,
  current: 0,
  answers: {},
  marked: new Set(),
  secondsLeft: 0,
  elapsed: 0,
  timerId: null,
  finished: false,
  startedAt: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function setScreen(screen) {
  ['home', 'exam', 'results'].forEach(name => {
    const node = $(`#${name}-screen`);
    const active = name === screen;
    node.hidden = !active;
    node.classList.toggle('active', active);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sampleAttempt() {
  const targets = [5, 2, 4, 7, 3, 3, 4, 1, 1];
  const selected = [];
  for (let chapter = 1; chapter <= 9; chapter += 1) {
    const group = shuffle(state.bank.filter(q => q.chapter === chapter));
    selected.push(...group.slice(0, targets[chapter - 1]));
  }
  if (selected.length < 30) {
    const selectedIds = new Set(selected.map(q => q.bank_id));
    selected.push(...shuffle(state.bank.filter(q => !selectedIds.has(q.bank_id))).slice(0, 30 - selected.length));
  }
  return shuffle(selected).slice(0, 30);
}

function formatTime(total) {
  const seconds = Math.max(0, Math.floor(total));
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function startAttempt() {
  state.attempt = sampleAttempt();
  state.current = 0;
  state.answers = {};
  state.marked = new Set();
  state.finished = false;
  state.startedAt = Date.now();
  const selectedDuration = Number($('#duration-select').value);
  state.secondsLeft = selectedDuration;
  state.elapsed = 0;
  if (state.timerId) window.clearInterval(state.timerId);
  if (selectedDuration > 0) state.timerId = window.setInterval(tick, 1000);
  setScreen('exam');
  renderExam();
}

function tick() {
  if (state.finished) return;
  state.elapsed += 1;
  if (state.secondsLeft > 0) {
    state.secondsLeft -= 1;
    renderTimer();
    if (state.secondsLeft <= 0) finishAttempt(true);
  }
}

function renderTimer() {
  const timer = $('#timer');
  const value = $('#timer-value');
  if (state.secondsLeft > 0) {
    value.textContent = formatTime(state.secondsLeft);
    timer.classList.toggle('warning', state.secondsLeft <= 300 && state.secondsLeft > 60);
    timer.classList.toggle('danger', state.secondsLeft <= 60);
  } else {
    value.textContent = 'Sin límite';
    timer.classList.remove('warning', 'danger');
  }
}

function renderPalette() {
  const palette = $('#question-palette');
  palette.replaceChildren();
  state.attempt.forEach((question, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'palette-button';
    button.textContent = index + 1;
    button.setAttribute('aria-label', `Ir a la pregunta ${index + 1}`);
    if (index === state.current) button.classList.add('current');
    if (state.answers[question.bank_id] !== undefined) button.classList.add('answered');
    if (state.marked.has(question.bank_id)) button.classList.add('marked');
    button.addEventListener('click', () => { state.current = index; renderExam(); });
    palette.appendChild(button);
  });
  const answered = Object.keys(state.answers).length;
  $('#answered-label').textContent = `${answered} respondidas`;
}

function renderQuestion() {
  const question = state.attempt[state.current];
  $('#question-chapter').textContent = `CAPÍTULO ${question.chapter} · ${chapterNames[question.chapter].toUpperCase()}`;
  $('#question-stem').textContent = question.stem;
  const statements = $('#question-statements');
  statements.replaceChildren();
  (question.statements || []).forEach((statement, index) => {
    const p = document.createElement('p');
    const number = document.createElement('span');
    number.textContent = `${index + 1}.`;
    p.append(number, document.createTextNode(statement));
    statements.appendChild(p);
  });
  const options = $('#question-options');
  options.replaceChildren();
  question.options.forEach((option, index) => {
    const label = document.createElement('label');
    label.className = 'option-label';
    if (state.answers[question.bank_id] === index) label.classList.add('selected');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `question-${question.bank_id}`;
    input.value = index;
    input.checked = state.answers[question.bank_id] === index;
    input.addEventListener('change', () => {
      state.answers[question.bank_id] = index;
      renderQuestion();
      renderPalette();
      updateProgress();
    });
    const letter = document.createElement('span');
    letter.className = 'option-letter';
    letter.textContent = `${String.fromCharCode(97 + index)})`;
    const text = document.createElement('span');
    text.className = 'option-text';
    text.textContent = option;
    label.append(input, letter, text);
    options.appendChild(label);
  });
  const markButton = $('#mark-button');
  const marked = state.marked.has(question.bank_id);
  markButton.classList.toggle('active', marked);
  markButton.innerHTML = marked ? '<span>◆</span> Marcada para revisar' : '<span>◇</span> Marcar para revisar';
}

function updateProgress() {
  const total = state.attempt.length;
  const position = state.current + 1;
  $('#progress-label').textContent = `Pregunta ${position} de ${total}`;
  $('#progress-fill').style.width = `${(position / total) * 100}%`;
  $('#answered-label').textContent = `${Object.keys(state.answers).length} respondidas`;
}

function renderExam() {
  renderQuestion();
  renderPalette();
  updateProgress();
  renderTimer();
  $('#prev-button').disabled = state.current === 0;
  $('#next-button').textContent = state.current === state.attempt.length - 1 ? 'Última pregunta' : 'Siguiente →';
}

function changeQuestion(delta) {
  state.current = Math.min(state.attempt.length - 1, Math.max(0, state.current + delta));
  renderExam();
}

function finishAttempt(auto = false) {
  if (state.finished) return;
  if (!auto) {
    const unanswered = state.attempt.length - Object.keys(state.answers).length;
    const message = unanswered > 0 ? `Todavía tienes ${unanswered} pregunta${unanswered === 1 ? '' : 's'} sin responder. ¿Finalizar de todas formas?` : '¿Quieres finalizar y ver la corrección?';
    if (!window.confirm(message)) return;
  }
  state.finished = true;
  if (state.timerId) window.clearInterval(state.timerId);
  const result = calculateResult(auto);
  saveHistory(result);
  renderResults(result);
  setScreen('results');
}

function calculateResult(auto) {
  let correct = 0;
  let omitted = 0;
  const rows = state.attempt.map(question => {
    const selected = state.answers[question.bank_id];
    const isOmitted = selected === undefined;
    const isCorrect = !isOmitted && selected === question.key;
    if (isOmitted) omitted += 1;
    if (isCorrect) correct += 1;
    return { question, selected, isOmitted, isCorrect };
  });
  return { correct, omitted, wrong: state.attempt.length - correct - omitted, rows, auto, elapsed: state.elapsed, finishedAt: new Date().toISOString() };
}

function saveHistory(result) {
  try {
    const history = JSON.parse(localStorage.getItem('b250-history') || '[]');
    history.unshift({ correct: result.correct, wrong: result.wrong, omitted: result.omitted, elapsed: result.elapsed, date: result.finishedAt });
    localStorage.setItem('b250-history', JSON.stringify(history.slice(0, 8)));
  } catch (error) { /* storage can be unavailable in private browser contexts */ }
}

function renderResults(result) {
  const total = state.attempt.length;
  $('#result-score').textContent = result.correct;
  $('#result-percent').textContent = `${Math.round((result.correct / total) * 100)}%`;
  $('#result-correct').textContent = result.correct;
  $('#result-wrong').textContent = result.wrong;
  $('#result-omitted').textContent = result.omitted;
  $('#result-time').textContent = formatTime(result.elapsed);
  $('#results-subtitle').textContent = result.auto ? 'El tiempo llegó a cero. Revisa cada respuesta y vuelve al manual en los errores.' : 'Revisa cada respuesta y convierte cada error en una página de estudio.';
  renderChapterBreakdown(result.rows);
  renderReview(result.rows);
}

function renderChapterBreakdown(rows) {
  const counts = {};
  rows.forEach(row => {
    const chapter = row.question.chapter;
    counts[chapter] ||= { total: 0, correct: 0 };
    counts[chapter].total += 1;
    if (row.isCorrect) counts[chapter].correct += 1;
  });
  const breakdown = $('#chapter-breakdown');
  breakdown.replaceChildren();
  Object.keys(counts).sort((a, b) => Number(a) - Number(b)).forEach(chapter => {
    const data = counts[chapter];
    const card = document.createElement('div');
    card.className = 'chapter-bar';
    const head = document.createElement('div');
    head.className = 'chapter-bar-head';
    const name = document.createElement('span');
    name.textContent = `Cap. ${chapter} · ${chapterNames[chapter]}`;
    const score = document.createElement('strong');
    score.textContent = `${data.correct}/${data.total}`;
    head.append(name, score);
    const track = document.createElement('div');
    track.className = 'bar-track';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = `${(data.correct / data.total) * 100}%`;
    track.appendChild(fill);
    card.append(head, track);
    breakdown.appendChild(card);
  });
}

function renderReview(rows) {
  const list = $('#review-list');
  list.replaceChildren();
  rows.forEach((row, index) => {
    const q = row.question;
    const card = document.createElement('article');
    card.className = `review-card ${row.isOmitted ? 'omitted' : row.isCorrect ? 'correct' : 'incorrect'}`;
    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'review-summary';
    const number = document.createElement('span');
    number.className = 'review-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const icon = document.createElement('span');
    icon.className = 'review-icon';
    icon.textContent = row.isOmitted ? '—' : row.isCorrect ? '✓' : '×';
    const title = document.createElement('span');
    title.className = 'review-title';
    title.textContent = q.topic;
    const badge = document.createElement('span');
    badge.className = 'review-badge';
    badge.textContent = row.isOmitted ? 'Omitida' : row.isCorrect ? 'Correcta' : 'Revisar';
    summary.append(number, icon, title, badge);
    const body = document.createElement('div');
    body.className = 'review-body';
    const stem = document.createElement('p');
    stem.className = 'review-question';
    stem.textContent = q.stem;
    const answers = document.createElement('div');
    answers.className = 'review-answer-row';
    const chosen = document.createElement('div');
    chosen.className = `answer-box ${row.isCorrect ? 'good' : row.isOmitted ? '' : 'bad'}`;
    const chosenLabel = document.createElement('span');
    chosenLabel.className = 'box-label';
    chosenLabel.textContent = 'Tu respuesta';
    const chosenText = document.createElement('p');
    chosenText.textContent = row.isOmitted ? 'No respondiste esta pregunta.' : `${String.fromCharCode(97 + row.selected)}) ${q.options[row.selected]}`;
    chosen.append(chosenLabel, chosenText);
    const correct = document.createElement('div');
    correct.className = 'answer-box good';
    const correctLabel = document.createElement('span');
    correctLabel.className = 'box-label';
    correctLabel.textContent = 'Respuesta correcta';
    const correctText = document.createElement('p');
    correctText.textContent = `${String.fromCharCode(97 + q.key)}) ${q.options[q.key]}`;
    correct.append(correctLabel, correctText);
    answers.append(chosen, correct);
    const explanation = document.createElement('p');
    explanation.className = 'explanation';
    explanation.textContent = q.option_reasons?.[q.key] || 'La alternativa correcta coincide con la regla del manual.';
    const source = document.createElement('div');
    source.className = 'source-line';
    source.textContent = `Manual · capítulo ${q.chapter} · página${q.pages.length > 1 ? 's' : ''} ${q.pages.join(', ')}`;
    body.append(stem, answers, explanation, source);
    summary.addEventListener('click', () => card.classList.toggle('open'));
    card.append(summary, body);
    list.appendChild(card);
  });
}

function renderHistory() {
  const section = $('#history-section');
  const list = $('#history-list');
  try {
    const history = JSON.parse(localStorage.getItem('b250-history') || '[]');
    section.hidden = history.length === 0;
    list.replaceChildren();
    history.forEach(entry => {
      const row = document.createElement('div');
      row.className = 'history-row';
      const date = new Date(entry.date);
      row.innerHTML = `<strong>${entry.correct}/30 · ${Math.round(entry.correct / 30 * 100)}%</strong><span>${date.toLocaleDateString('es-CL')} · ${formatTime(entry.elapsed)} · ${entry.wrong} errores · ${entry.omitted} omitidas</span>`;
      list.appendChild(row);
    });
  } catch (error) { section.hidden = true; }
}

function goHome() {
  if (state.timerId) window.clearInterval(state.timerId);
  state.finished = true;
  renderHistory();
  setScreen('home');
}

function bindEvents() {
  $('#start-button').addEventListener('click', startAttempt);
  $('#prev-button').addEventListener('click', () => changeQuestion(-1));
  $('#next-button').addEventListener('click', () => changeQuestion(1));
  $('#finish-button').addEventListener('click', () => finishAttempt(false));
  $('#mark-button').addEventListener('click', () => {
    const id = state.attempt[state.current].bank_id;
    if (state.marked.has(id)) state.marked.delete(id); else state.marked.add(id);
    renderExam();
  });
  $('#toggle-nav').addEventListener('click', () => document.body.classList.toggle('nav-collapsed'));
  $('#retry-button').addEventListener('click', startAttempt);
  $('#results-home-button').addEventListener('click', goHome);
  document.querySelector('[data-home]').addEventListener('click', event => { event.preventDefault(); goHome(); });
  $('#collapse-review').addEventListener('click', () => {
    const cards = $$('.review-card');
    const shouldOpen = cards.some(card => !card.classList.contains('open'));
    cards.forEach(card => card.classList.toggle('open', shouldOpen));
    $('#collapse-review').textContent = shouldOpen ? 'Contraer todo' : 'Expandir todo';
  });
  $('#clear-history').addEventListener('click', () => { localStorage.removeItem('b250-history'); renderHistory(); });
}

async function init() {
  bindEvents();
  renderHistory();
  try {
    const response = await fetch('banco_B250.json');
    if (!response.ok) throw new Error('No se pudo cargar el banco');
    const payload = await response.json();
    state.bank = payload.items || [];
    $('#bank-status').textContent = `${state.bank.length} preguntas disponibles`;
    $('#start-button').disabled = state.bank.length < 30;
  } catch (error) {
    $('#bank-status').textContent = 'No se pudo cargar el banco';
    $('#start-button').textContent = 'Reintentar carga';
    $('#start-button').disabled = false;
    $('#start-button').addEventListener('click', init, { once: true });
  }
}

document.addEventListener('DOMContentLoaded', init);
