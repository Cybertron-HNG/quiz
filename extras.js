// start.ng game extras, shared by start.ng's multiplayer games: a sound for each move and for how the game ended, a
// "play again?" popup for everyone in the room (a rematch, or a new round from the host), and something moving while
// you wait (a bar while finding a match, a spinner while waiting for friends). Needs https://start.ng/kit.js.
//
//   StartngExtras.watch(room, { hosted })             after opening a room (hosted: a quiz or bingo, where the host starts rounds)
//   StartngExtras.move(mine)  StartngExtras.end(kind, title, again)   for a game against the bot in this browser
//   StartngExtras.reset()                             when the player leaves the room or the game
(() => {
  const $ = (id) => document.getElementById(id);
  const css = `
.x-sound { position: fixed; top: 12px; right: 12px; z-index: 5; padding: 6px 12px; font-size: .8rem; border-radius: 999px; }
.x-sound[aria-pressed="false"] { color: var(--muted); }
.x-popup { position: fixed; inset: 0; z-index: 10; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .45); }
.x-card { display: grid; gap: 12px; justify-items: center; width: min(100%, 360px); padding: 24px 18px 14px; text-align: center;
  border: 1.5px solid var(--ink); border-radius: 20px; background: var(--card); box-shadow: 6px 6px 0 var(--lime); animation: x-pop .18s ease-out; }
.x-title { margin: 0; font-size: 1.6rem; font-weight: 800; letter-spacing: -.03em; }
.x-note { margin: 0; color: var(--muted); font-size: .95rem; }
.x-note.ask { color: var(--ink); font-weight: 700; }
.x-buttons { display: grid; gap: 8px; width: 100%; }
.x-spinner { width: 34px; height: 34px; border-radius: 50%; border: 3px solid var(--line); border-top-color: var(--lime); animation: x-spin .9s linear infinite; }
.x-progress { width: 100%; height: 8px; border-radius: 999px; background: var(--line); overflow: hidden; }
.x-progress span { display: block; height: 100%; background: var(--lime); transform: scaleX(0); transform-origin: left; transition: transform .25s linear; }
@keyframes x-pop { from { transform: scale(.92); opacity: 0; } }
@keyframes x-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .x-card { animation: none; } .x-spinner { animation-duration: 3s; } .x-progress span { transition: none; } }
[hidden] { display: none !important; }`;

  // ---------- sound (made in the browser, no sound files) ----------

  let audio = null;
  let muted = false;
  try { muted = localStorage.getItem('startng-muted') === '1'; } catch { /* private mode */ }
  const SOUNDS = { // [frequency, start, length] in Hz and seconds
    mine: [[660, 0, 0.07]],
    theirs: [[440, 0, 0.07]],
    win: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.25]],
    lose: [[392, 0, 0.16], [311, 0.16, 0.3]],
    draw: [[523, 0, 0.12], [523, 0.18, 0.16]],
  };
  const wake = () => {
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch { audio = null; }
  };
  addEventListener('pointerdown', wake); // browsers only allow sound after the player has touched the page

  function play(name) {
    if (muted || !audio || !SOUNDS[name]) return;
    const t0 = audio.currentTime + 0.01;
    for (const [freq, at, length] of SOUNDS[name]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.2, t0 + at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + length);
      osc.connect(gain).connect(audio.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + length + 0.05);
    }
  }

  // ---------- the page bits (added once) ----------

  let ui = null;
  function build() {
    if (ui) return ui;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    const sound = Object.assign(document.createElement('button'), { type: 'button', className: 'x-sound' });
    const popup = document.createElement('div');
    popup.className = 'x-popup';
    popup.hidden = true;
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.setAttribute('aria-labelledby', 'x-title');
    popup.innerHTML = `<div class="x-card"><p class="x-title" id="x-title"></p><p class="x-note" role="status" aria-live="polite"></p>
      <div class="x-buttons"><button type="button" class="primary x-again">Rematch</button><button type="button" class="x-back">Back to the lobby</button></div>
      <button type="button" class="link x-close">See the board</button></div>`;
    document.body.append(sound, popup);
    ui = { sound, popup, title: popup.querySelector('.x-title'), note: popup.querySelector('.x-note'), again: popup.querySelector('.x-again') };
    const setMuted = (value) => {
      muted = value;
      try { localStorage.setItem('startng-muted', value ? '1' : '0'); } catch { /* private mode */ }
      sound.textContent = value ? 'Sound off' : 'Sound on';
      sound.setAttribute('aria-pressed', String(!value));
    };
    setMuted(muted);
    sound.onclick = () => { wake(); setMuted(!muted); if (!muted) play('mine'); };
    popup.querySelector('.x-back').onclick = () => { close(); $('back')?.click(); };
    popup.querySelector('.x-close').onclick = close;
    popup.onclick = (e) => { if (e.target === popup) close(); };
    addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    ui.again.onclick = () => again?.();
    // the waiting screen: a spinner, and a bar for matchmaking
    const title = $('waiting-title');
    if (title) {
      ui.spinner = Object.assign(document.createElement('span'), { className: 'x-spinner' });
      ui.spinner.setAttribute('aria-hidden', 'true');
      ui.bar = document.createElement('div');
      ui.bar.className = 'x-progress';
      ui.bar.setAttribute('role', 'progressbar');
      ui.bar.setAttribute('aria-label', 'Looking for a player');
      ui.bar.setAttribute('aria-valuemin', '0');
      ui.bar.setAttribute('aria-valuemax', String(MATCH_SECONDS));
      ui.bar.append(document.createElement('span'));
      title.before(ui.spinner);
      title.after(ui.bar);
      ui.spinner.hidden = ui.bar.hidden = true;
    }
    return ui;
  }

  // ---------- the popup ----------

  let room = null; // the room being watched
  let hosted = false; // a game with a host (quiz, bingo)
  let again = null; // what the popup's main button does
  let shownFor = null; // which ended game the popup was shown for (so closing it keeps it closed)
  let lastTurn = null; // whose turn it was, to tell whose move a new state is
  let ended = false;
  const close = () => { if (ui) ui.popup.hidden = true; };
  const names = (players) => players.map((p) => p.name).join(' and ');
  const outcomeTitle = () => $('status')?.textContent?.trim() || 'Game over';

  function open(title) {
    build();
    ui.title.textContent = title;
    ui.popup.hidden = false;
    update();
    ui.again.hidden || ui.again.disabled ? ui.popup.querySelector('.x-back').focus() : ui.again.focus();
  }

  // What the popup says: who has asked for a rematch, who is gone, and whether this player can ask.
  function update() {
    if (!ui || ui.popup.hidden) return;
    const { note } = ui;
    const button = ui.again;
    note.className = 'x-note';
    button.hidden = false;
    button.disabled = false;
    if (!room) return; // a game against the bot in this browser: the caller set the button up
    if (typeof room.rematch !== 'function') { // an older kit without rematches: a new game is a new room
      button.hidden = true;
      note.textContent = 'Go back to the lobby to play again.';
      return;
    }
    const others = room.players.filter((p) => p.seat !== room.you && !p.bot);
    if (hosted) { // a game with a host: the host starts the next round
      button.textContent = 'New round';
      button.hidden = room.you !== 0;
      note.textContent = room.you === 0 ? 'Start another round with everyone here?' : 'Waiting for the host to start a new round.';
      again = () => { room.rematch(); close(); };
      return;
    }
    const asked = room.rematchAsked || [];
    const gone = others.filter((p) => !p.online);
    button.textContent = 'Rematch';
    button.disabled = asked.includes(room.you) || gone.length > 0;
    again = () => { room.rematch(); room.rematchAsked = [...asked, room.you]; update(); };
    if (gone.length) note.textContent = `${names(gone)} left, so there's no rematch.`;
    else if (asked.includes(room.you)) note.textContent = `Waiting for ${names(others.filter((p) => !asked.includes(p.seat)))}…`;
    else if (others.some((p) => asked.includes(p.seat))) {
      note.textContent = `${names(others.filter((p) => asked.includes(p.seat)))} wants a rematch!`;
      note.className = 'x-note ask';
    } else note.textContent = 'Play again?';
  }

  function resultSound(result, you) {
    if (hosted && you === 0) play('draw'); // the host ran the game rather than played it
    else play(result.winner == null ? 'draw' : result.winner === you ? 'win' : 'lose');
  }

  // ---------- waiting: a bar for matchmaking, a spinner for friends ----------

  const MATCH_SECONDS = 60; // start.ng looks for a match for a minute (and offers the bot after 15 seconds)
  let matchStart = 0;
  setInterval(() => {
    if (!ui?.spinner) return;
    const waiting = $('waiting') && !$('waiting').hidden;
    const matching = waiting && room && !room.code;
    ui.spinner.hidden = !waiting || matching;
    ui.bar.hidden = !matching;
    if (matching) {
      const seconds = Math.min(MATCH_SECONDS, (Date.now() - matchStart) / 1000);
      ui.bar.firstChild.style.transform = `scaleX(${seconds / MATCH_SECONDS})`;
      ui.bar.setAttribute('aria-valuenow', String(Math.round(seconds)));
    }
  }, 250);

  // ---------- the public part ----------

  window.StartngExtras = Object.freeze({
    watch(r, opts = {}) {
      build();
      room = r;
      hosted = !!opts.hosted;
      matchStart = Date.now();
      shownFor = null;
      lastTurn = r.turn;
      ended = !!r.result;
      close();
      r.on('welcome', () => {
        if (shownFor !== null && r.status !== 'over' && !r.result) { // a rematch or a new round has started
          shownFor = null;
          close();
        }
        lastTurn = r.turn;
        ended = !!r.result;
      });
      r.on('state', () => {
        if (r.status === 'playing' || (r.result && !['resigned', 'left'].includes(r.result.reason))) { // a move, not a resignation
          if (lastTurn !== null && lastTurn !== undefined) play(lastTurn === r.you ? 'mine' : 'theirs');
        }
        lastTurn = r.turn;
        if (r.result && !ended) {
          ended = true;
          setTimeout(() => resultSound(r.result, r.you), 180);
          if (shownFor !== r.code) {
            shownFor = r.code;
            setTimeout(() => { if (room === r && r.result) open(outcomeTitle()); }, 700); // after the last move lands
          }
        }
      });
      r.on('rematch', () => {
        const someoneElse = (r.rematchAsked || []).some((seat) => seat !== r.you);
        if (someoneElse && ui.popup.hidden && r.result) open(outcomeTitle()); // they asked: show it again
        update();
      });
      for (const name of ['away', 'back', 'join']) r.on(name, update);
      r.on('closed', () => { if (room === r) StartngExtras.reset(); });
    },
    // A game against the bot in this browser
    move: (mine) => play(mine ? 'mine' : 'theirs'),
    end(kind, title, playAgain) {
      room = null;
      play(kind);
      setTimeout(() => {
        open(title);
        ui.again.textContent = 'Play again';
        ui.note.textContent = 'Play again?';
        again = () => { close(); playAgain(); };
      }, 600);
    },
    reopen() { if (room?.result) open(outcomeTitle()); }, // the game's own Rematch button, after the popup was closed
    canRematch: () => typeof room?.rematch === 'function',
    reset() { room = null; again = null; shownFor = null; close(); },
    sound: play,
  });
  build(); // the Sound button shows from the start (this file loads at the end of the page)
})();
