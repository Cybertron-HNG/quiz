# Quiz on start.ng

Make a quiz and play it live with a room of up to 100 people, like a classroom or a party game. It will live at `quiz.start.ng`.

- The person who makes the quiz is the **host**. They write the questions (2 to 4 answers each, up to 50 questions, 5 to 120 seconds each), make the room, share the code, and start it.
- Everyone else joins with the code or the link and answers on their own screen. A right answer scores 500 points, plus up to 500 more for answering fast (counted in half seconds).
- The host can close a question early or move on. A question also closes when everyone has answered or the time runs out.
- start.ng's server keeps the time and the score, and never sends the right answer before a question closes. A player who drops can come back (10 minutes). Everyone needs to be signed in with start.ng.

A plain HTML, CSS and JavaScript game (no build step) that loads the start.ng Kit (`https://start.ng/kit.js`). The rules live on the server (`startng-be`, `app/features/rooms/games/quiz.py`). The host's draft questions are kept in this browser, so they are there next time.

The host sends the quiz once with `room.setup({ title, questions: [{ q, answers, correct, seconds }] })` and then `room.start()`; a player answers with `room.send({ answer: 0 })` and the host moves on with `room.send({ skip: true })`.

## Publish
On start.ng, sign in, open **Your games** and paste this repo's link. The repo must be named `quiz`, because the server's rooms know the game by that name.

| File | What it does |
| --- | --- |
| `index.html` | The page: lobby, question writer, waiting room, game |
| `game.js` | The lobby, rooms (through `startng.rooms`), the question writer and the screens |
| `style.css` | The look |
| `startng.json` | The description shown on the game's page |
