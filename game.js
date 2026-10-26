// Quiz on start.ng. The host writes the questions and starts the room; start.ng's server keeps time and score and never sends the
// right answer before a question closes. Needs https://start.ng/kit.js (loaded in index.html).
(() => {
  const $ = (id) => document.getElementById(id);
  const SYMBOLS = ['▲', '◆', '●', '■'];
  const DRAFT = 'startng-quiz-draft';
  const REASONS = {
    not_found: 'That room has closed, or the code is wrong.',
    nobody_came: 'Nobody joined in time, so the room closed.',
    inactive: 'The room closed because nothing happened for a while.',
    empty: 'The room closed because everyone left.',
    finished: 'That quiz is over and the room closed.',
    too_old: 'That room was open too long, so it closed.',
    offline: "Couldn't reconnect. Check your connection and try again.",
    code_4403: 'That room is full (100 players).',
    code_4404: 'That room has closed, or the code is wrong.',
    code_4409: 'You joined from another tab, so this one stopped.',
    code_4429: 'Too many wrong codes. Wait a minute and try again.',
    code_4401: 'Sign in with start.ng to play.',
  };

  let room = null;
  let pendingSetup = null; // what the host wrote, sent as soon as the room exists
  let timer = null;

  const show = (name) => { for (const id of ['lobby', 'builder', 'waiting', 'game']) $(id).hidden = id !== name; };
  const problem = (text) => { $('lobby-problem').textContent = text || ''; $('lobby-problem').hidden = !text; };
  const builderProblem = (text) => { $('builder-problem').textContent = text || ''; $('builder-problem').hidden = !text; };
  const reasonText = (reason) => REASONS[reason] || 'The room closed.';
  const note = (text) => { $('game-note').textContent = text || ''; };
  const nameOf = (seat) => room?.players.find((p) => p.seat === seat)?.name ?? 'Player';
  const el = (tag, props = {}, text) => { const e = Object.assign(document.createElement(tag), props); if (text !== undefined) e.textContent = text; return e; };

  // ---------- the lobby ----------

  function needSignIn(why) { problem(why); $('signin').hidden = false; }

  async function guarded(open) {
    problem('');
    $('signin').hidden = true;
    try {
      return await open();
    } catch (err) {
      if (err.message === 'signin') needSignIn('Sign in with start.ng to play.');
      else if (/^closed:/.test(err.message)) problem(reasonText(`code_${err.message.slice(7)}`));
      else problem(err.message || "Couldn't start. Try again.");
      return null;
    }
  }

  function wire(r) {
    room = r;
    r.on('welcome', () => {
      if (pendingSetup && r.host === 0 && r.status === 'waiting') { r.setup(pendingSetup); }
      render();
    });
    r.on('setup_ok', () => { pendingSetup = null; render(); });
    r.on('state', render);
    r.on('join', render);
    r.on('away', render);
    r.on('back', render);
    r.on('reconnecting', () => note('Reconnecting…'));
    r.on('open', () => note(''));
    r.on('error', (m) => {
      if (m.code === 'bad_setup') { leaveRoom(''); show('builder'); builderProblem(m.message); } else note(m.message);
    });
    r.on('closed', (m) => leaveRoom(reasonText(m.reason)));
    StartngExtras.watch(r, { hosted: true }); // sounds, the "play again?" popup, and the waiting spinner (extras.js)
    render();
  }

  async function open(make) {
    const r = await guarded(make);
    if (r) wire(r);
    return r;
  }

  async function joinRoom(code) {
    const r = await open(() => startng.rooms.join(code));
    if (!r && new URLSearchParams(location.search).has('room')) history.replaceState(null, '', location.pathname);
  }

  function leaveRoom(message) {
    room?.leave();
    StartngExtras.reset();
    room = null;
    pendingSetup = null;
    clearInterval(timer);
    history.replaceState(null, '', location.pathname);
    show('lobby');
    problem(message || '');
  }

  // ---------- the builder (the host's questions) ----------

  let draft = { title: '', questions: [] };
  const blank = () => ({ q: '', answers: ['', '', '', ''], correct: 0, seconds: 20 });

  function loadDraft() {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT) || 'null');
      if (saved && Array.isArray(saved.questions) && saved.questions.length) draft = saved;
    } catch { /* no saved draft */ }
    if (!draft.questions.length) draft.questions = [blank()];
  }

  function saveDraft() {
    try { localStorage.setItem(DRAFT, JSON.stringify(draft)); } catch { /* not saved, fine */ }
  }

  function drawBuilder() {
    $('title').value = draft.title;
    $('questions').replaceChildren(...draft.questions.map((item, n) => {
      const box = el('fieldset', { className: 'question-box' });
      box.append(el('legend', {}, `Question ${n + 1}`));
      const q = el('input', { value: item.q, maxLength: 200, placeholder: 'Type the question', ariaLabel: `Question ${n + 1}` });
      q.oninput = () => { item.q = q.value; saveDraft(); };
      box.append(q);
      item.answers.forEach((text, i) => {
        const row = el('label', { className: 'answer-row' });
        const right = el('input', { type: 'radio', name: `right-${n}`, checked: item.correct === i, ariaLabel: `Answer ${i + 1} is the right one` });
        right.onchange = () => { item.correct = i; saveDraft(); };
        const field = el('input', { value: text, maxLength: 100, placeholder: i < 2 ? `Answer ${i + 1}` : `Answer ${i + 1} (optional)`, ariaLabel: `Answer ${i + 1}` });
        field.oninput = () => { item.answers[i] = field.value; saveDraft(); };
        row.append(el('span', { className: `symbol a${i}` }, SYMBOLS[i]), field, right);
        box.append(row);
      });
      const foot = el('div', { className: 'q-foot' });
      const secs = el('select', { ariaLabel: 'Time to answer' });
      for (const s of [10, 15, 20, 30, 45, 60, 90, 120]) secs.append(el('option', { value: s, selected: item.seconds === s }, `${s} seconds`));
      secs.onchange = () => { item.seconds = Number(secs.value); saveDraft(); };
      const remove = el('button', { type: 'button', className: 'link', disabled: draft.questions.length === 1 }, 'Remove');
      remove.onclick = () => { draft.questions.splice(n, 1); saveDraft(); drawBuilder(); };
      foot.append(secs, remove);
      box.append(foot);
      return box;
    }));
  }

  // Turns what was typed into what the server takes (empty optional answers are dropped; the right answer is re-numbered).
  function buildSetup() {
    const questions = [];
    for (const [n, item] of draft.questions.entries()) {
      const kept = item.answers.map((text, i) => ({ text: text.trim(), right: i === item.correct })).filter((a) => a.text);
      if (!item.q.trim()) return { error: `Question ${n + 1} needs some text.` };
      if (kept.length < 2) return { error: `Question ${n + 1} needs at least two answers.` };
      if (!item.answers[item.correct].trim()) return { error: `Question ${n + 1}: the answer you marked as right is empty.` };
      questions.push({ q: item.q.trim(), answers: kept.map((a) => a.text), correct: kept.findIndex((a) => a.right), seconds: item.seconds });
    }
    return { data: { title: draft.title.trim() || 'Quiz', questions } };
  }

  // ---------- drawing the room ----------

  const isHost = () => room?.host === 0 && room.you === 0;
  const countdown = () => Math.max(0, (room.state.deadline_ms - room.serverNow()) / 1000);

  function render() {
    if (!room) return;
    if (room.code) history.replaceState(null, '', `${location.pathname}?room=${room.code}`);
    if (room.status === 'waiting' || room.status === null) { drawWaiting(); return; }
    show('game');
    drawGame();
    clearInterval(timer);
    timer = setInterval(tickBar, 200);
    tickBar();
  }

  function drawWaiting() {
    show('waiting');
    $('room-code').textContent = room.code || '';
    const players = room.players.filter((p) => !p.host);
    $('people').textContent = players.length ? `${players.length} ${players.length === 1 ? 'player' : 'players'} in` : 'Nobody has joined yet';
    $('names').replaceChildren(...players.map((p) => el('li', { className: p.online ? '' : 'away' }, p.seat === room.you ? `${p.name} (you)` : p.name)));
    $('start').hidden = !isHost();
    $('start').disabled = !players.length;
    $('waiting-title').textContent = isHost() ? 'Share this code' : 'You are in. Waiting for the host to start.';
    $('waiting-note').textContent = isHost() ? 'People join with the code or the link. Start when everyone is in; people can still join after.' : '';
  }

  function drawGame() {
    const s = room.state;
    const host = isHost();
    const result = room.result;
    $('progress').textContent = result ? 'Final scores' : `Question ${s.index + 1} of ${s.total}`;
    const showQuestion = s.phase !== 'over';
    $('question').hidden = !showQuestion;
    $('answers').hidden = !showQuestion;
    $('question').textContent = s.q || '';
    $('bar').hidden = !(s.phase === 'ready' || s.phase === 'question');
    $('answers').replaceChildren(...(s.answers || []).map((text, i) => {
      const b = el('button', { type: 'button', className: `answer a${i}` });
      b.append(el('span', { className: 'symbol' }, SYMBOLS[i]), el('span', { className: 'label' }, text));
      if (s.phase === 'reveal') {
        b.classList.add(i === s.correct ? 'right' : 'wrong');
        if (s.choice === i) b.classList.add('mine');
        b.append(el('span', { className: 'tally' }, String(s.counts[i])));
      } else if (s.choice === i) b.classList.add('mine');
      b.disabled = host || s.phase !== 'question' || s.choice !== undefined;
      b.onclick = () => room.send({ answer: i });
      return b;
    }));

    let status = '';
    if (s.phase === 'ready') status = host ? 'Get ready…' : 'Get ready!';
    else if (s.phase === 'question') status = host ? `${s.answered} of ${s.players} answered` : (s.choice !== undefined ? 'Locked in. Waiting for the others…' : 'Pick an answer');
    else if (s.phase === 'reveal' && !host) status = s.points ? `Right! +${s.points} points` : (s.choice === undefined ? 'Too slow' : 'Not this time');
    else if (s.phase === 'reveal') status = `${s.answered} of ${s.players} answered`;
    else if (s.phase === 'over' && !host) status = s.rank === 1 ? 'You won! 🎉' : `You came ${ordinal(s.rank)} with ${s.score} points`;
    else if (s.phase === 'over') status = 'The quiz is over';
    $('status').textContent = status;

    const board = s.phase === 'over' ? s.standings : s.phase === 'reveal' ? s.top : null;
    $('top').hidden = !board;
    if (board) {
      $('top').replaceChildren(...board.map((row) => {
        const li = el('li', { className: row.seat === room.you ? 'me' : '' });
        li.append(el('span', { className: 'rank' }, String(row.rank)), el('span', { className: 'who' }, row.seat === room.you ? 'You' : nameOf(row.seat)), el('span', { className: 'pts' }, String(row.score)));
        return li;
      }));
    }
    $('skip').hidden = !host || s.phase === 'over' || s.phase === 'ready';
    $('skip').textContent = s.phase === 'reveal' ? 'Next question' : 'Close the question';
    $('share').hidden = s.phase !== 'over';
    $('back').hidden = s.phase !== 'over';
    note('');
  }

  function ordinal(n) {
    const v = n % 100;
    return `${n}${[, 'st', 'nd', 'rd'][(v - 20) % 10] || [, 'st', 'nd', 'rd'][v] || 'th'}`;
  }

  function tickBar() {
    if (!room?.state) return;
    const s = room.state;
    if (s.phase === 'ready') {
      const wait = Math.ceil((s.started_ms - room.serverNow()) / 1000);
      $('status').textContent = wait > 0 ? `Starting in ${wait}` : 'Go!';
      $('bar-fill').style.width = '100%';
    } else if (s.phase === 'question') {
      const left = countdown();
      $('bar-fill').style.width = `${Math.min(100, (left / s.seconds) * 100)}%`;
      $('progress').textContent = `Question ${s.index + 1} of ${s.total} · ${Math.ceil(left)}s`;
    }
  }

  // ---------- buttons ----------

  $('host').onclick = () => { loadDraft(); drawBuilder(); builderProblem(''); show('builder'); };
  $('add-question').onclick = () => { if (draft.questions.length >= 50) { builderProblem('A quiz can have up to 50 questions.'); return; } draft.questions.push(blank()); saveDraft(); drawBuilder(); };
  $('title').oninput = () => { draft.title = $('title').value; saveDraft(); };
  $('builder-cancel').onclick = () => { show('lobby'); builderProblem(''); };
  $('create').onclick = async () => {
    builderProblem('');
    const built = buildSetup();
    if (built.error) { builderProblem(built.error); return; }
    pendingSetup = built.data;
    const r = await open(() => startng.rooms.create());
    if (!r) { pendingSetup = null; show('lobby'); }
  };
  $('join').onsubmit = (e) => { e.preventDefault(); const code = $('code').value.trim(); if (code) joinRoom(code); };
  $('signin').onclick = () => startng.signIn();
  $('start').onclick = () => room?.start();
  $('skip').onclick = () => room?.send({ skip: true });
  $('wait-cancel').onclick = () => leaveRoom('');
  $('back').onclick = () => leaveRoom('');
  $('share').onclick = () => startng.share({ text: 'I just played a live quiz on start.ng. Make one for your friends!' });
  $('copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(room?.inviteUrl() ?? '');
      $('copy').textContent = 'Link copied';
    } catch {
      $('copy').textContent = room?.inviteUrl() ?? 'Copy failed';
    }
    setTimeout(() => { $('copy').textContent = 'Copy invite link'; }, 2000);
  };

  // ---------- start ----------

  async function start() {
    if (!window.startng) { problem('start.ng could not load. Check your connection.'); return; }
    const player = await startng.getPlayer();
    const code = startng.rooms.codeFromUrl();
    if (code && player?.user) joinRoom(code);
    else if (code) {
      $('invite').textContent = `You were invited to a quiz (room ${code}).`;
      $('invite').hidden = false;
      needSignIn('Sign in with start.ng to join the quiz.');
    }
  }

  if (window.startng) start();
  else addEventListener('load', start);
})();
