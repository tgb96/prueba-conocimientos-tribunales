const chapterNames = {
  1: 'Sección general', 2: 'Organización y auxiliares', 3: 'Reglas procesales generales',
  4: 'Procedimientos civiles', 5: 'Familia', 6: 'Laboral', 7: 'Penal',
  8: 'Cortes de Apelaciones', 9: 'Corte Suprema'
};

const state = {
  bank: [],
  profile: null,
  exposure: { sequence: 0, items: {} },
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

const EXPOSURE_KEY = 'tribunales-question-exposure-v1';

function readExposure() {
  try {
    const saved = JSON.parse(localStorage.getItem(EXPOSURE_KEY));
    if (!saved || !Number.isSafeInteger(saved.sequence) || saved.sequence < 0 || !saved.items) return;
    const items = {};
    for (const question of state.bank) {
      const entry = saved.items[question.bank_id];
      if (entry && Number.isSafeInteger(entry.seen) && entry.seen > 0 &&
          Number.isSafeInteger(entry.last) && entry.last > 0 && entry.last <= saved.sequence) {
        items[question.bank_id] = { seen: entry.seen, last: entry.last };
      }
    }
    state.exposure = { sequence: saved.sequence, items };
  } catch { /* Si el navegador bloquea el almacenamiento, se conserva la memoria de esta sesión. */ }
}

function recordExposure(questions) {
  state.exposure.sequence += 1;
  for (const question of questions) {
    const previous = state.exposure.items[question.bank_id];
    state.exposure.items[question.bank_id] = {
      seen: (previous?.seen || 0) + 1,
      last: state.exposure.sequence
    };
  }
  try { localStorage.setItem(EXPOSURE_KEY, JSON.stringify(state.exposure)); }
  catch { /* La selección sigue funcionando con memoria durante esta sesión. */ }
}

function exposureOf(variants) {
  const result = variants.reduce((result, question) => {
    const entry = state.exposure.items[question.bank_id];
    result.seen += entry?.seen || 0;
    result.minimum = Math.min(result.minimum, entry?.seen || 0);
    result.last = Math.max(result.last, entry?.last || 0);
    return result;
  }, { seen: 0, last: 0, minimum: Infinity });
  // Primero ampliar conocimientos; después recorrer sus variantes y equilibrar el uso.
  result.priority = [result.seen > 0 ? 1 : 0, result.minimum, result.seen];
  return result;
}

function compareUse(left, right) {
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

function addUse(...scores) {
  return [0, 1, 2].map(index => scores.reduce((sum, score) => sum + score[index], 0));
}

function leastUsed(list, exposure) {
  return shuffle(list).sort((a, b) => {
    const left = exposure(a), right = exposure(b);
    const rank = left.priority && right.priority ? compareUse(left.priority, right.priority) : left.seen - right.seen;
    return rank || left.last - right.last;
  });
}

function sampleAttempt(total = 30) {
  if (![10, 30].includes(total)) throw new Error('Elige un intento de 10 o 30 preguntas.');
  const profile = state.profile;
  if (!profile) throw new Error('No se ha cargado la pauta de selección.');
  const targets = total === 30 ? profile.chapter_quotas_30
    : roundQuotas(profile.chapter_quotas_30.map(quota => quota / 3));
  // 91 ítems de tres modelos completos: 52 directas, 36 combinaciones, 3 ordenaciones.
  const roundRandom = n => Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
  const directTarget = roundRandom(total * profile.formats.Directa / profile.reference_items);
  const orderTarget = roundRandom(total * profile.formats.Ordenación / profile.reference_items);
  const pools = [];
  for (let chapter = 1; chapter <= 9; chapter += 1) {
    const groups = new Map();
    for (const question of state.bank.filter(q => q.chapter === chapter)) {
      const family = question.family_id || question.bank_id;
      if (!groups.has(family)) groups.set(family, []);
      groups.get(family).push(question);
    }
    const byFormat = { Directa: [], Combinación: [], Ordenación: [] };
    for (const variants of groups.values()) byFormat[variants[0].format].push(variants);
    for (const format of Object.keys(byFormat)) byFormat[format] = leastUsed(byFormat[format], exposureOf);
    byFormat.costs = {};
    for (const format of ['Directa', 'Combinación', 'Ordenación']) {
      const sums = [[0, 0, 0]];
      for (const variants of byFormat[format]) sums.push(addUse(sums.at(-1), exposureOf(variants).priority));
      byFormat.costs[format] = sums;
    }
    pools.push(byFormat);
  }
  function choose(n, k) {
    if (k < 0 || k > n) return 0;
    let ways = 1;
    for (let i = 1; i <= k; i += 1) ways = ways * (n - i + 1) / i;
    return ways;
  }
  const memo = new Map();
  function allocations(chapter, directLeft, orderLeft) {
    const pool = pools[chapter];
    const quota = targets[chapter];
    const options = [];
    for (let d = 0; d <= Math.min(quota, directLeft, pool.Directa.length); d += 1) {
      for (let o = 0; o <= Math.min(quota - d, orderLeft, pool.Ordenación.length); o += 1) {
        const c = quota - d - o;
        if (c > pool.Combinación.length) continue;
        const future = ways(chapter + 1, directLeft - d, orderLeft - o);
        const cost = addUse(future.cost, pool.costs.Directa[d], pool.costs.Combinación[c], pool.costs.Ordenación[o]);
        const weight = choose(pool.Directa.length, d) * choose(pool.Combinación.length, c) * choose(pool.Ordenación.length, o) * future.weight;
        if (weight > 0) options.push({ d, c, o, weight, cost });
      }
    }
    const minimum = options.reduce((best, option) => compareUse(option.cost, best) < 0 ? option.cost : best, [Infinity, Infinity, Infinity]);
    return options.filter(option => compareUse(option.cost, minimum) === 0);
  }
  function ways(chapter, directLeft, orderLeft) {
    if (chapter === 9) return directLeft === 0 && orderLeft === 0
      ? { cost: [0, 0, 0], weight: 1 } : { cost: [Infinity, Infinity, Infinity], weight: 0 };
    const key = `${chapter}/${directLeft}/${orderLeft}`;
    if (!memo.has(key)) {
      const options = allocations(chapter, directLeft, orderLeft);
      memo.set(key, { cost: options[0]?.cost ?? [Infinity, Infinity, Infinity], weight: options.reduce((sum, a) => sum + a.weight, 0) });
    }
    return memo.get(key);
  }
  if (!ways(0, directTarget, orderTarget).weight) throw new Error('No hay suficientes preguntas para mantener la pauta del intento.');
  const selected = [];
  let directLeft = directTarget;
  let orderLeft = orderTarget;
  for (let chapter = 0; chapter < 9; chapter += 1) {
    const options = allocations(chapter, directLeft, orderLeft);
    let ticket = Math.random() * options.reduce((sum, a) => sum + a.weight, 0);
    let allocation = options.at(-1);
    for (const option of options) {
      ticket -= option.weight;
      if (ticket <= 0) { allocation = option; break; }
    }
    for (const [format, amount] of [['Directa', allocation.d], ['Combinación', allocation.c], ['Ordenación', allocation.o]]) {
      for (const variants of pools[chapter][format].slice(0, amount)) {
        selected.push(leastUsed(variants, question => state.exposure.items[question.bank_id] || { seen: 0, last: 0 })[0]);
      }
    }
    directLeft -= allocation.d;
    orderLeft -= allocation.o;
  }
  if (selected.length !== total || new Set(selected.map(q => q.family_id || q.bank_id)).size !== total) throw new Error('La selección del intento no es válida.');
  return shuffle(selected);
}

function roundQuotas(values) {
  const integers = values.map(Math.floor);
  const fractions = values.map((value, index) => value - integers[index]);
  // Redondeo dependiente: mantiene la suma y el promedio de cada capítulo.
  let pending = fractions.map((value, index) => index).filter(index => fractions[index] > 1e-9 && fractions[index] < 1 - 1e-9);
  while (pending.length >= 2) {
    const [i, j] = shuffle(pending);
    const up = Math.min(1 - fractions[i], fractions[j]);
    const down = Math.min(fractions[i], 1 - fractions[j]);
    if (Math.random() < down / (up + down)) { fractions[i] += up; fractions[j] -= up; }
    else { fractions[i] -= down; fractions[j] += down; }
    pending = pending.filter(index => fractions[index] > 1e-9 && fractions[index] < 1 - 1e-9);
  }
  return integers.map((value, index) => value + Math.round(fractions[index]));
}

function configureAttempt() {
  const total = Number($('#attempt-select').value);
  const quick = total === 10;
  const duration = $('#duration-select');
  duration.replaceChildren();
  for (const minutes of quick ? [5, 10, 15, 0] : [30, 45, 60, 0]) {
    const option = document.createElement('option');
    option.value = minutes * 60;
    option.textContent = minutes ? `${minutes} minutos` : 'Sin cronómetro';
    option.selected = minutes === (quick ? 15 : 45);
    duration.appendChild(option);
  }
  $('#setup-description').textContent = quick
    ? '10 preguntas para practicar en menos tiempo. Los temas rotan y se priorizan preguntas que te hayan salido menos veces en este navegador.'
    : '30 preguntas de todos los capítulos, con la proporción de tus modelos y prioridad a las que te hayan salido menos veces en este navegador.';
}

function formatTime(total) {
  const seconds = Math.max(0, Math.floor(total));
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function startAttempt() {
  readExposure();
  state.attempt = sampleAttempt(Number($('#attempt-select').value));
  recordExposure(state.attempt);
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
  $('#exam-title').textContent = state.attempt.length === 10 ? 'Intento rápido' : 'Prueba de conocimientos';
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
  return { correct, omitted, wrong: state.attempt.length - correct - omitted, total: state.attempt.length, rows, auto, elapsed: state.elapsed, finishedAt: new Date().toISOString() };
}

function saveHistory(result) {
  try {
    const history = JSON.parse(localStorage.getItem('b500-history') || '[]');
    history.unshift({ correct: result.correct, wrong: result.wrong, omitted: result.omitted, total: result.total, elapsed: result.elapsed, date: result.finishedAt });
    localStorage.setItem('b500-history', JSON.stringify(history.slice(0, 8)));
  } catch (error) { /* storage can be unavailable in private browser contexts */ }
}

function renderResults(result) {
  const total = result.total;
  $('#result-score').textContent = result.correct;
  $('#result-total').textContent = `/ ${total}`;
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

function reviewExplanation(row) {
  const q = row.question;
  const correctReason = q.option_reasons?.[q.key] || '';
  if (row.isCorrect || row.isOmitted) return correctReason;

  if (q.format === 'Combinación') {
    const choice = q.options[row.selected];
    const selected = new Set(/^Todas\b/i.test(choice)
      ? q.statements.map((_, index) => index + 1)
      : /^Ninguna\b/i.test(choice) ? [] : (choice.match(/\d+/g) || []).map(Number));
    const mismatches = q.truth.flatMap((truth, index) =>
      selected.has(index + 1) !== (q.negative ? !truth : truth) ? [index] : []);
    const extra = mismatches.filter(index => selected.has(index + 1)).map(index => index + 1);
    const missing = mismatches.filter(index => !selected.has(index + 1)).map(index => index + 1);
    const error = [];
    if (extra.length) error.push(`Tu respuesta incluye indebidamente ${extra.length === 1 ? 'la afirmación' : 'las afirmaciones'} ${extra.join(', ')}.`);
    if (missing.length) error.push(`${missing.length === 1 ? 'Falta incluir la afirmación' : 'Faltan las afirmaciones'} ${missing.join(', ')}.`);
    const task = q.negative ? 'Se pedían las afirmaciones falsas.' : 'Se pedían las afirmaciones verdaderas.';
    return [task, ...error].join(' ');
  }

  const selectedReason = q.option_reasons?.[row.selected] || '';
  if (q.format === 'Ordenación') {
    // Evitar repetir dos veces la secuencia completa en las pautas antiguas.
    const error = selectedReason.startsWith('Invierte pasos del orden descrito:')
      ? 'La alternativa elegida altera el orden de las etapas.' : selectedReason;
    return [error, correctReason].filter(Boolean).join(' ');
  }

  // Las pautas antiguas de algunas directas sólo remitían a una definición.
  // Explicitar la regla respaldada por la clave evita una corrección vacía.
  const genericReason = /^(?:Ésa es|Es (?:la (?:definición|noción|función|secuencia|caracterización)|el (?:trámite|contenido|carácter|período|supuesto))|Son (?:los (?:dos|requisitos)|las (?:dos|tres))|Reúne|El manual (?:diferencia|identifica)|La (?:enumeración|composición)|El (?:plazo|período) está|La página \d+ (?:lo establece|contiene ese)|Ambas condiciones)/i.test(correctReason);
  const rule = genericReason && !q.negative
    ? `En este caso corresponde: «${q.options[q.key].replace(/\.$/, '')}».` : correctReason;
  const specificError = !selectedReason.startsWith('La opción propone') && selectedReason !== correctReason
    ? selectedReason : '';
  return [specificError, rule].filter(Boolean).join(' ');
}

function studyPoints(question) {
  if (question.format === 'Combinación') {
    return question.statements.map((statement, index) => ({
      label: `Afirmación ${index + 1} · ${question.truth[index] ? 'Verdadera' : 'Falsa: regla correcta'}`,
      text: question.study_statement_notes?.[index] || (question.truth[index]
        ? (statement.length < 35 && question.statement_reasons[index] !== statement
          ? `${statement} ${question.statement_reasons[index]}` : statement)
        : question.statement_reasons[index]),
      isCorrection: !question.truth[index]
    }));
  }
  const reason = question.option_reasons[question.key];
  // Una clave negativa contiene un error: enseñar su corrección, no presentarla como regla.
  const generic = /^(?:Ésa es|Es (?:la (?:definición|noción|función|secuencia|caracterización|regla)|el (?:trámite|contenido|carácter|período|supuesto))|Son (?:los (?:dos|requisitos)|las (?:dos|tres))|Reúne|El manual (?:diferencia|identifica)|La (?:enumeración|composición|edad y los estudios)|El (?:plazo|período) está|La página \d+ (?:lo establece|contiene ese|establece ambas)|Ambas condiciones|Coincide con|La definición corresponde)/i.test(reason);
  return [{
    label: question.format === 'Ordenación' ? 'Orden de las etapas' : 'Regla que debes recordar',
    text: generic && !question.negative ? `${question.options[question.key]} ${reason}` : reason,
    isCorrection: false
  }];
}

function renderStudyExplanation(question) {
  const section = document.createElement('section');
  section.className = 'study-explanation';
  section.setAttribute('aria-label', 'Para aprender la regla');
  const title = document.createElement('h3');
  title.textContent = 'Para aprender la regla';
  const list = document.createElement('ul');
  list.className = 'study-points';
  for (const point of studyPoints(question)) {
    const item = document.createElement('li');
    item.className = point.isCorrection ? 'study-point correction' : 'study-point';
    const label = document.createElement('strong');
    label.className = 'study-point-label';
    label.textContent = point.label;
    const text = document.createElement('p');
    text.className = 'study-text';
    text.textContent = point.text;
    item.append(label, text);
    list.appendChild(item);
  }
  section.append(title, list);
  for (const note of question.study_notes || []) {
    const aside = document.createElement('div');
    aside.className = 'study-note';
    const label = document.createElement('strong');
    label.textContent = note.title || 'Distingue estas reglas';
    const text = document.createElement('p');
    text.textContent = note.text;
    const source = document.createElement('small');
    source.className = 'study-note-source';
    source.textContent = `Manual · página${note.pages.length > 1 ? 's' : ''} ${note.pages.join(', ')}`;
    aside.append(label, text, source);
    section.appendChild(aside);
  }
  return section;
}

function updateReviewToggle() {
  $('#collapse-review').textContent = $$('.review-card').some(card => !card.classList.contains('open'))
    ? 'Expandir todo' : 'Contraer todo';
}

function renderReview(rows) {
  const list = $('#review-list');
  list.replaceChildren();
  rows.forEach((row, index) => {
    const q = row.question;
    const card = document.createElement('article');
    card.className = `review-card ${row.isOmitted ? 'omitted' : row.isCorrect ? 'correct' : 'incorrect open'}`;
    card.dataset.questionId = q.bank_id;
    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'review-summary';
    summary.setAttribute('aria-expanded', String(card.classList.contains('open')));
    summary.setAttribute('aria-controls', `review-body-${index}`);
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
    body.id = `review-body-${index}`;
    const stem = document.createElement('p');
    stem.className = 'review-question';
    stem.textContent = q.stem;
    const statements = document.createElement('ol');
    statements.className = 'review-statements';
    q.statements.forEach(text => {
      const statement = document.createElement('li');
      statement.textContent = text;
      statements.appendChild(statement);
    });
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
    const explanation = document.createElement('div');
    explanation.className = `review-explanation ${!row.isCorrect && !row.isOmitted ? 'error-explanation' : ''}`;
    const explanationLabel = document.createElement('strong');
    explanationLabel.className = 'explanation-label';
    explanationLabel.textContent = !row.isCorrect && !row.isOmitted ? 'Por qué tu respuesta es incorrecta' : 'Fundamento de la respuesta';
    const explanationText = document.createElement('p');
    explanationText.className = 'explanation';
    explanationText.textContent = reviewExplanation(row);
    explanation.append(explanationLabel, explanationText);
    const source = document.createElement('div');
    source.className = 'source-line';
    source.textContent = `Manual · capítulo ${q.chapter} · página${q.pages.length > 1 ? 's' : ''} ${q.pages.join(', ')}`;
    if (q.origin?.kind === 'previous_exam') {
      const origin = document.createElement('p');
      origin.className = 'model-origin';
      origin.textContent = q.origin.sources.map(s => s.pdf_page
        ? `${s.file} · pregunta ${s.question} · página PDF ${s.pdf_page}`
        : `${s.file} · ${s.section || 'modelo aportado'} · pregunta ${s.question}`).join(' / ');
      source.appendChild(origin);
      if (q.origin.adjustments.length) {
        const note = document.createElement('p');
        note.className = 'model-adjustment';
        note.textContent = `Ajuste respecto del modelo: ${q.origin.adjustments.join(' ')}`;
        source.appendChild(note);
      }
    }
    if (q.official_sources?.length) {
      const label = document.createElement('p');
      label.className = 'official-sources';
      label.textContent = 'Respaldo oficial complementario: ';
      q.official_sources.forEach((reference, index) => {
        if (index) label.appendChild(document.createTextNode(' · '));
        const link = document.createElement('a');
        link.href = reference.url;
        link.textContent = reference.title;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        label.appendChild(link);
      });
      source.appendChild(label);
    }
    body.appendChild(stem);
    if (q.statements.length) body.appendChild(statements);
    body.appendChild(answers);
    // El diagnóstico explica la selección; el bloque de estudio enseña todas las reglas,
    // incluidas las proposiciones falsas que el usuario descartó correctamente.
    if (!row.isCorrect && !row.isOmitted) body.appendChild(explanation);
    body.append(renderStudyExplanation(q), source);
    summary.addEventListener('click', () => {
      card.classList.toggle('open');
      summary.setAttribute('aria-expanded', String(card.classList.contains('open')));
      updateReviewToggle();
    });
    card.append(summary, body);
    list.appendChild(card);
  });
  updateReviewToggle();
}

function renderHistory() {
  const section = $('#history-section');
  const list = $('#history-list');
  try {
    const history = JSON.parse(localStorage.getItem('b500-history') || '[]');
    section.hidden = history.length === 0;
    list.replaceChildren();
    history.forEach(entry => {
      const row = document.createElement('div');
      row.className = 'history-row';
      const date = new Date(entry.date);
      const total = entry.total || 30;
      row.innerHTML = `<strong>${entry.correct}/${total} · ${Math.round(entry.correct / total * 100)}%</strong><span>${date.toLocaleDateString('es-CL')} · ${formatTime(entry.elapsed)} · ${entry.wrong} errores · ${entry.omitted} omitidas</span>`;
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
  $('#attempt-select').addEventListener('change', configureAttempt);
  $('#start-button').addEventListener('click', () => state.bank.length ? startAttempt() : loadBank());
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
    cards.forEach(card => {
      card.classList.toggle('open', shouldOpen);
      card.querySelector('.review-summary').setAttribute('aria-expanded', String(shouldOpen));
    });
    $('#collapse-review').textContent = shouldOpen ? 'Contraer todo' : 'Expandir todo';
  });
  $('#clear-history').addEventListener('click', () => { localStorage.removeItem('b500-history'); renderHistory(); });
}

async function loadBank() {
  const button = $('#start-button');
  button.disabled = true;
  button.textContent = 'Cargando preguntas…';
  try {
    const response = await fetch('banco_B400.json?v=20261024-explicaciones');
    if (!response.ok) throw new Error('No se pudo cargar el banco');
    const payload = await response.json();
    state.bank = payload.items || [];
    state.profile = payload.selection_profile;
    if (state.bank.length < 30) throw new Error('El banco no tiene suficientes preguntas');
    if (!state.profile?.chapter_quotas_30 || state.profile.chapter_quotas_30.reduce((sum, n) => sum + n, 0) !== 30) throw new Error('La pauta de temas no es válida');
    button.innerHTML = 'Iniciar intento <span aria-hidden="true">↗</span>';
    button.disabled = false;
  } catch (error) {
    state.bank = [];
    state.profile = null;
    button.textContent = 'Reintentar carga';
    button.disabled = false;
  }
}

async function init() {
  bindEvents();
  configureAttempt();
  renderHistory();
  await loadBank();
}

document.addEventListener('DOMContentLoaded', init);
