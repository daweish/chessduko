import './style.css';
import { GENERATOR_VERSION, type DailySet, type GenerationResult } from './engine';
import { LocalDate, RecentDates, DateLabel, UntilMidnight } from './dates';
import { RenderPuzzleSvg } from './grid';
import type { DownloadKind } from './pdf';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="masthead"><a class="brand" href="./" aria-label="Daily Chessdoku home"><span class="brand-mark" aria-hidden="true">▦</span> CHESSDOKU</a><span class="edition">A DAILY PUZZLE RITUAL</span></header>
  <main>
    <section class="intro"><p class="eyebrow">EIGHT NUMBERS. A NEW CHALLENGE.</p><h1>Your daily dose<br>of <span>Chessdoku.</span></h1><p class="description">Sudoku with a different shape. Three fresh challenges each day,<br class="desktop-break"> ready to download, print, and ponder.</p></section>
    <section class="daily" aria-labelledby="daily-title"><div class="section-heading"><h2 id="daily-title">The daily selection</h2><span id="selected-date"></span></div>
      <nav class="date-nav" aria-label="Choose a puzzle date"><button class="arrow" id="previous-dates" aria-label="Scroll toward newer dates">←</button><div id="dates" class="dates" role="group" aria-label="Last seven days"></div><button class="arrow" id="older-dates" aria-label="Scroll toward older dates">→</button></nav>
      <p id="override" class="override" hidden></p>
      <div id="status" class="status" role="status" aria-live="polite"></div><div id="puzzles" class="puzzles" aria-busy="true"></div><p id="download-status" role="status" aria-live="polite"></p>
    </section>
    <section class="rules" aria-labelledby="rules-title"><div><p class="eyebrow">A LITTLE TWIST ON A CLASSIC</p><h2 id="rules-title">How to play</h2></div><ol><li><strong>Use the numbers 1–8.</strong> Each row, column, and bold-outlined region must contain each number exactly once.</li><li><strong>Follow the colors.</strong> White squares take even numbers (2, 4, 6, 8). Gray squares take odd numbers (1, 3, 5, 7).</li><li><strong>Let logic lead.</strong> Every puzzle has one solution and can be solved without guessing. No chess moves required.</li></ol></section>
  </main><footer><span>A new set every day. A little time for yourself.</span><span>Made for pencil & paper.</span></footer>`;
const dates_element = document.querySelector<HTMLDivElement>('#dates')!;
const puzzles_element = document.querySelector<HTMLDivElement>('#puzzles')!;
const status_element = document.querySelector<HTMLDivElement>('#status')!;
const cache = new Map<string, DailySet>();
let today = LocalDate(),
  selected_date = today;
let override_seed = new URL(location.href).searchParams.get('seed');
let request_id = 0;
let worker: Worker | undefined;
let midnight_timer: ReturnType<typeof setTimeout>;
function RenderDates(): void {
  dates_element.replaceChildren();
  for (const [index, date] of RecentDates().entries()) {
    const is_birthday = date.endsWith('-09-09');
    const button = document.createElement('button');
    button.className = 'date-button';
    button.setAttribute('aria-pressed', String(date === selected_date && override_seed === null));
    button.setAttribute(
      'aria-label',
      `${date}${index === 0 ? ', today' : ''}${is_birthday ? ', birthday' : ''}`,
    );
    const day = document.createElement('span');
    day.textContent =
      index === 0
        ? 'TODAY'
        : new Intl.DateTimeFormat('en-US', { weekday: 'short' })
            .format(new Date(`${date}T12:00:00`))
            .toUpperCase();
    const label = document.createElement('strong');
    label.textContent = `${DateLabel(date)}${is_birthday ? ' 🎂' : ''}`;
    button.append(day, label);
    button.onclick = () => {
      selected_date = date;
      override_seed = null;
      const url = new URL(location.href);
      url.searchParams.delete('seed');
      history.replaceState(null, '', url);
      RenderDates();
      LoadDay();
      dates_element
        .querySelector<HTMLElement>('[aria-pressed="true"]')
        ?.focus({ preventScroll: true });
    };
    dates_element.append(button);
  }
}
function RenderPuzzles(puzzles: DailySet): void {
  puzzles_element.replaceChildren();
  puzzles_element.setAttribute('aria-busy', 'false');
  status_element.textContent = '';
  for (const [index, difficulty] of (['easy', 'medium', 'hard'] as const).entries()) {
    const puzzle = puzzles[difficulty],
      card = document.createElement('article');
    card.className = 'puzzle-card';
    card.dataset.difficulty = difficulty;
    card.innerHTML = `<div class="card-heading"><h3>${difficulty}</h3><span class="difficulty-dots" aria-hidden="true">${'●'.repeat(index + 1)}${'○'.repeat(2 - index)}</span></div><p class="card-description">${['A gentle place to begin.', 'A little more to untangle.', 'Settle in. Take your time.'][index]}</p><div class="grid-preview">${RenderPuzzleSvg(puzzle)}</div><p class="clue-count">${puzzle.clue_count} clues · One unique solution</p><button class="download-puzzle">Download puzzle <span aria-hidden="true">↓</span></button><button class="download-solution">Download solution</button>`;
    for (const kind of ['puzzle', 'solution'] as DownloadKind[]) {
      const button = card.querySelector<HTMLButtonElement>(`.download-${kind}`)!;
      button.setAttribute('aria-label', `Download ${difficulty} ${kind} PDF`);
      button.onclick = async () => {
        button.disabled = true;
        const download_status = document.querySelector<HTMLElement>('#download-status')!;
        download_status.textContent = `Preparing ${difficulty} ${kind} PDF…`;
        try {
          const { CreatePuzzlePdf, DownloadName } = await import('./pdf');
          const bytes = await CreatePuzzlePdf(puzzle, kind);
          const url = URL.createObjectURL(
            new Blob([new Uint8Array(bytes).buffer], { type: 'application/pdf' }),
          );
          const link = document.createElement('a');
          link.href = url;
          link.download = DownloadName(puzzle, kind);
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
          download_status.textContent = `${difficulty[0].toUpperCase() + difficulty.slice(1)} ${kind} PDF ready. Print on US Letter paper.`;
        } catch {
          download_status.textContent =
            'The PDF could not be prepared. Please try the download again.';
        } finally {
          button.disabled = false;
        }
      };
    }
    puzzles_element.append(card);
  }
}
function Failure(message: string): void {
  puzzles_element.replaceChildren();
  puzzles_element.setAttribute('aria-busy', 'false');
  status_element.classList.remove('loading');
  status_element.textContent = message;
}
function LoadDay(): void {
  worker?.terminate();
  worker = undefined;
  const current_id = ++request_id,
    seed = override_seed ?? selected_date;
  const key = JSON.stringify([GENERATOR_VERSION, seed]);
  const override = document.querySelector<HTMLElement>('#override')!;
  override.hidden = override_seed === null;
  override.textContent =
    override_seed === null
      ? ''
      : `Test seed: ${JSON.stringify(override_seed)}. Choose a date to return to daily puzzles.`;
  document.querySelector<HTMLElement>('#selected-date')!.textContent =
    override_seed === null ? selected_date : 'CUSTOM SEED';
  document.querySelector<HTMLElement>('#download-status')!.textContent = '';
  status_element.classList.remove('loading');
  if (cache.has(key)) {
    RenderPuzzles(cache.get(key)!);
    return;
  }
  puzzles_element.replaceChildren();
  puzzles_element.setAttribute('aria-busy', 'true');
  status_element.classList.add('loading');
  status_element.textContent =
    'Creating your puzzles and checking every solution. This may take a moment…';
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (
      event: MessageEvent<{ request_id: number; result?: GenerationResult; error?: string }>,
    ) => {
      if (event.data.request_id !== request_id) return;
      worker?.terminate();
      worker = undefined;
      status_element.classList.remove('loading');
      const result = event.data.result;
      if (!result?.ok) {
        Failure(
          result
            ? `We couldn't create a verified ${result.difficulty} puzzle for this seed. Please choose another day.`
            : 'Puzzle generation could not finish. Please reload or choose another day.',
        );
        return;
      }
      cache.set(key, result.puzzles);
      if (cache.size > 7) cache.delete(cache.keys().next().value!);
      RenderPuzzles(result.puzzles);
    };
    worker.onerror = () => {
      if (current_id === request_id) {
        worker?.terminate();
        worker = undefined;
        Failure('Puzzle generation could not start. Please reload the page.');
      }
    };
    worker.postMessage({ request_id: current_id, seed });
  } catch {
    Failure('Your browser could not start puzzle generation. Please try a current browser.');
  }
}
function RefreshDate(): void {
  const new_today = LocalDate();
  if (new_today !== today) {
    const was_today = selected_date === today;
    today = new_today;
    if (was_today || !RecentDates().includes(selected_date)) selected_date = today;
    RenderDates();
    if (override_seed === null) LoadDay();
  }
  clearTimeout(midnight_timer);
  midnight_timer = setTimeout(RefreshDate, UntilMidnight());
}
document
  .querySelector('#previous-dates')!
  .addEventListener('click', () => dates_element.scrollBy({ left: -240, behavior: 'smooth' }));
document
  .querySelector('#older-dates')!
  .addEventListener('click', () => dates_element.scrollBy({ left: 240, behavior: 'smooth' }));
dates_element.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const buttons = [...dates_element.querySelectorAll('button')];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = buttons[Math.max(0, Math.min(6, index + (event.key === 'ArrowRight' ? 1 : -1)))];
  next?.focus();
  event.preventDefault();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) RefreshDate();
});
window.addEventListener('focus', RefreshDate);
window.addEventListener('pagehide', () => worker?.terminate());
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    RefreshDate();
    LoadDay();
  }
});
RenderDates();
LoadDay();
RefreshDate();
