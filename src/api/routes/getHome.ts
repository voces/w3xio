import { Handler } from "../types.ts";

export const getHome: Handler = () =>
  new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>w3xio - Warcraft III Lobby Alerts</title>
  <link rel="icon" type="image/png" href="data:image/png;base64,iVBORw0KGgo=">
  <style>
  *, *::before, *::after { box-sizing: border-box }
  :root {
    color-scheme: dark;
    background-color: #111;
    color: #bbb;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 15px;
  }
  html { scroll-behavior: smooth }
  body { max-width: 760px; margin: 40px auto; padding: 0 20px; line-height: 1.7 }
  @keyframes flash {
    0% { opacity: 0 }
    8% { opacity: 1 }
    50% { opacity: 1 }
    100% { opacity: 0 }
  }
  @keyframes flash-quick {
    0% { opacity: 1 }
    100% { opacity: 0 }
  }
  .flash, .flash-quick { position: relative; --flash-inset: -8px -12px }
  .flash::after, .flash-quick::after {
    content: "";
    position: absolute;
    inset: var(--flash-inset);
    border-radius: inherit;
    background: #2a3a4a;
    box-shadow: inset 3px 0 0 #5b9bd5;
    pointer-events: none;
    mix-blend-mode: lighten;
  }
  .flash::after { animation: flash 2.5s ease-in-out forwards }
  .flash-quick::after { animation: flash-quick 0.8s ease-out forwards }
  [id] { scroll-margin-top: 16px }
  h1 { color: #fff; margin-bottom: 4px; font-size: 22px }
  h2 { color: #ddd; margin-top: 40px; font-size: 17px; border-bottom: 1px solid #222; padding-bottom: 6px }
  a { color: #5b9bd5; text-decoration: none }
  a:hover { color: #7bc0ff }
  code {
    background: #1e1e1e;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 0.88em;
    color: #ddd;
  }
  pre {
    background: #1e1e1e;
    padding: 14px 18px;
    border-radius: 6px;
    overflow-x: auto;
    line-height: 1.5;
    font-size: 13px;
  }
  pre code { padding: 0; background: none }
  ol, ul { padding-left: 22px }
  li { margin: 6px 0 }
  .steps { counter-reset: step }
  .steps > li { counter-increment: step; list-style: none; position: relative; padding-left: 8px; margin: 14px 0 }
  .steps > li::before {
    content: counter(step);
    position: absolute;
    left: -26px;
    width: 22px; height: 22px;
    background: #5b9bd5;
    color: #111;
    border-radius: 50%;
    font-size: 12px; font-weight: 600;
    text-align: center; line-height: 22px;
  }
  .tip {
    background: #1a2a1a;
    border-left: 3px solid #4ec97a;
    padding: 10px 14px;
    border-radius: 4px;
    margin: 16px 0;
    font-size: 14px;
    color: #9d9;
  }
  .note {
    color: #777;
    font-size: 13px;
  }
  .section-label {
    display: inline-block;
    background: #222;
    color: #888;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    border-radius: 3px;
    margin-bottom: 6px;
  }
  .field-list { list-style: none; padding: 0 }
  .field-list li { margin: 10px 0; padding-left: 16px; border-left: 2px solid #2a2a2a }
  .field-list strong { color: #ddd }

  /* Interactive try-it */
  .try-it {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    padding: 20px;
    margin: 20px 0;
  }
  .try-it { --flash-inset: 0 }
  .try-it h3 { margin: 0 0 4px; color: #ddd; font-size: 15px }
  .try-it p { margin: 4px 0 14px; font-size: 13px; color: #777 }
  .try-input {
    width: 100%;
    background: #111;
    border: 1px solid #333;
    border-radius: 5px;
    padding: 10px 14px;
    font: inherit;
    font-size: 15px;
    color: #fff;
    outline: none;
    transition: border-color 0.15s;
  }
  .try-input:focus { border-color: #5b9bd5 }
  .try-input::placeholder { color: #555 }
  .match-info {
    font-size: 13px;
    color: #666;
    margin: 10px 0 6px;
    min-height: 20px;
  }
  .match-info .count { color: #5b9bd5 }
  .match-list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 260px;
    overflow-y: auto;
  }
  .match-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 13px;
    margin: 0;
  }
  .match-list li:nth-child(odd) { background: #161616 }
  .match-list .map-name { color: #ccc; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .match-list .lobby-meta { color: #666; white-space: nowrap; margin-left: 12px; font-size: 12px }
  .match-list .highlight { color: #5b9bd5 }
  .try-empty { color: #555; font-size: 13px; text-align: center; padding: 20px 0 }
  .try-examples { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0 }
  .try-chip {
    background: #222;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 3px 10px;
    font-size: 12px;
    color: #aaa;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
    font-family: monospace;
  }
  .try-chip:hover { border-color: #5b9bd5; color: #ddd }
  .tryable { cursor: pointer; border-bottom: 1px dashed #555; transition: color 0.15s, border-color 0.15s }
  .tryable:hover { color: #5b9bd5; border-color: #5b9bd5 }
  .try-error { color: #e05252; font-size: 13px; margin: 8px 0 0 }
  .regex-table { width: 100%; border-collapse: collapse; margin: 12px 0 }
  .regex-table th { text-align: left; color: #888; font-size: 12px; font-weight: 500; padding: 6px 12px; border-bottom: 1px solid #2a2a2a }
  .regex-table td { padding: 8px 12px; border-bottom: 1px solid #1e1e1e; font-size: 14px }
  .regex-table td:first-child { font-family: monospace; color: #ddd; white-space: nowrap }
  .regex-table td:last-child { color: #999 }
  .regex-table tr:hover td { background: #1a1a1a }

  /* Alert mockup */
  .alert-mockup {
    background: #2b2d31;
    border-radius: 8px;
    padding: 12px 16px;
    margin: 4px 0 16px;
    font-size: 14px;
    display: inline-block;
  }
  .alert-mockup .bot-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .alert-mockup .bot-name { color: #fff; font-weight: 500 }
  .alert-mockup .bot-tag {
    background: #5b65ea;
    color: #fff;
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 500;
  }
  .alert-mockup .bot-time { color: #949ba4; font-size: 12px; margin-left: 4px }
  .alert-mockup .embed {
    border-left: 3px solid #4ec97a;
    padding: 10px 14px;
    background: #1e1f22;
    border-radius: 0 4px 4px 0;
    margin-top: 4px;
  }
  .alert-mockup .embed-title { color: #fff; font-weight: 500; margin-bottom: 8px }
  .alert-mockup .embed-fields { display: inline-grid; grid-template-columns: auto auto auto; gap: 4px 24px }
  .alert-mockup .embed-field-full { grid-column: 1 / -1 }
  .alert-mockup .embed-label { color: #949ba4; font-size: 12px; font-weight: 500 }
  .alert-mockup .embed-value { color: #dbdee1; font-size: 14px }
  </style>
</head>
<body>
  <h1>Live Lobbies</h1>
  <p>A Discord bot that notifies your channel when a Warcraft III lobby matching your filter goes live.</p>
  <p><a href="/status">View live lobbies &rarr;</a></p>

  <h2>Getting started</h2>
  <ol class="steps">
    <li><a href="https://discord.com/oauth2/authorize?client_id=651473852135899136&scope=bot&permissions=16384" target="_blank" rel="noopener">Add the bot</a> to your Discord server.</li>
    <li>Go to the channel where you want notifications.</li>
    <li>Type <code>/alert</code> &mdash; a form pops up.</li>
    <li>Type part of the file name in the <strong>File name</strong> field, then submit.</li>
  </ol>
  <div class="tip">That's it for most setups. If you want alerts for Tree Tag games, just type <code>tree tag</code> in the File name field. You don't need to fill in every field &mdash; one filter is enough.</div>

  <p>Here's what an alert looks like in Discord:</p>
  <div class="alert-mockup">
    <div class="bot-header">
      <span class="bot-tag">APP</span>
      <span class="bot-name">Live Lobbies</span>
      <span class="bot-time">Today at 10:39 AM</span>
    </div>
    <div class="embed">
      <div class="embed-title">(4)losttemple s2</div>
      <div class="embed-fields">
        <div class="embed-field-full"><div class="embed-label">Game name</div><div class="embed-value">1v1 not pro</div></div>
        <div><div class="embed-label">Host</div><div class="embed-value">Knightofwin#2524</div></div>
        <div><div class="embed-label">Realm</div><div class="embed-value">eu</div></div>
        <div><div class="embed-label">Players</div><div class="embed-value">1/4</div></div>
      </div>
    </div>
  </div>

  <h2>The /alert form</h2>
  <p>When you run <code>/alert</code>, a form appears with several fields. <strong>The only one that matters for most alerts is File name.</strong></p>
  <ul class="field-list">
    <li><strong>File name</strong> &mdash; this is the filter. Type part of the file name (like <code>tree tag</code>) or use a <a href="#regex">regex</a> for more control (like <code>/tree.*tag/i</code>). This single field is all you need for the vast majority of alerts.</li>
  </ul>
  <p class="note" style="margin-top: -2px">The other fields below are rarely needed &mdash; skip them unless you have a specific reason.</p>
  <ul class="field-list">
    <li><strong>Host</strong> &mdash; only get alerts for games hosted by a specific player.</li>
    <li><strong>Lobby name</strong> &mdash; filter by the game name the host chose.</li>
    <li><strong>Realm</strong> &mdash; restrict to a server region: <code>us</code>, <code>eu</code>, or <code>kr</code>.</li>
  </ul>
  <p>You can test all of these filters against live lobbies on the <a href="/status">status page</a>.</p>
  <p><strong>Message</strong> &mdash; optional text included with each notification. Use it to ping a role, e.g. <code>@TreeTagPlayers game is up!</code>. For conditional messages, see <a href="#templates">message templates</a>.</p>

  <h2>Try your filter</h2>
  <div class="try-it" id="tryFilter">
    <h3>What file name are you looking for?</h3>
    <p>Type below to search current lobbies. This is exactly what the bot's File name filter does. Plain text and <code>/regex/i</code> both work.</p>
    <input class="try-input" id="tryInput" type="text" placeholder="e.g. tree tag, legion td, or /dota|legion/i" autocomplete="off" />
    <div class="try-examples" id="tryExamples">
      <span class="try-chip" data-value="tree tag">tree tag</span>
      <span class="try-chip" data-value="/tree.*tag/i">/tree.*tag/i</span>
      <span class="try-chip" data-value="/dota|legion/i">/dota|legion/i</span>
      <span class="try-chip" data-value="/footmen frenzy/i">/footmen frenzy/i</span>
      <span class="try-chip" data-value="/Risk\\s+(Europe|Asia).*/i">/Risk\\s+(Europe|Asia).*/i</span>
    </div>
    <div class="match-info" id="matchInfo"></div>
    <div class="try-error" id="tryError" hidden></div>
    <ul class="match-list" id="matchList"></ul>
  </div>

  <h2 id="regex">Plain text vs regex</h2>
  <p>Both work in any filter field. Plain text does a simple "contains" match (ignoring capitalization), which is fine for many cases. Regex (short for "regular expression") is a way to write flexible search patterns &mdash; like matching multiple files in one filter, or being precise about word boundaries. About 40% of alerts use regex.</p>
  <p>To use regex, wrap your filter in slashes and add <code>i</code> at the end to ignore capitalization:</p>
  <pre><code>/your pattern here/i</code></pre>

  <h3>Examples</h3>
  <table class="regex-table">
    <thead><tr><th>Filter</th><th>What it matches</th></tr></thead>
    <tbody>
      <tr><td><code class="tryable" data-try="/tree.*tag/i">/tree.*tag/i</code></td><td>Any file with "tree" followed by "tag" (with anything in between), like "Tree Tag Reforged 2.5"</td></tr>
      <tr><td><code class="tryable" data-try="/dota|legion/i">/dota|legion/i</code></td><td>Files containing "dota" <em>or</em> "legion" &mdash; the <code>|</code> means "or"</td></tr>
      <tr><td><code class="tryable" data-try="/reforged.*footmen/i">/reforged.*footmen/i</code></td><td>Files with "reforged" followed later by "footmen"</td></tr>
      <tr><td><code class="tryable" data-try="/Risk\\s+(Europe|Asia).*/i">/Risk\\s+(Europe|Asia).*/i</code></td><td>"Risk" followed by "Europe" or "Asia" &mdash; <code>\\s+</code> matches spaces, <code>(A|B)</code> matches either A or B</td></tr>
      <tr><td><code class="tryable" data-try="/^footmen frenzy/i">/^footmen frenzy/i</code></td><td>Files that <em>start with</em> "Footmen Frenzy" &mdash; <code>^</code> means "beginning of name"</td></tr>
      <tr><td><code class="tryable" data-try="/bootybay${'$'}/i">/bootybay${'$'}/i</code></td><td>Files that <em>end with</em> "Island Defense" &mdash; <code>${'$'}</code> means "end of name"</td></tr>
    </tbody>
  </table>

  <h3>Quick reference</h3>
  <p>You only need a few building blocks to write useful patterns:</p>
  <table class="regex-table">
    <thead><tr><th>Pattern</th><th>Meaning</th></tr></thead>
    <tbody>
      <tr><td><code>.</code></td><td>Any single character</td></tr>
      <tr><td><code>.*</code></td><td>Any number of characters (including none)</td></tr>
      <tr><td><code>.+</code></td><td>One or more of any character</td></tr>
      <tr><td><code>A|B</code></td><td>Match A or B</td></tr>
      <tr><td><code>(A|B)</code></td><td>Group &mdash; match A or B as part of a larger pattern</td></tr>
      <tr><td><code>\\s</code></td><td>A space or tab</td></tr>
      <tr><td><code>^</code></td><td>Start of the name</td></tr>
      <tr><td><code>${'$'}</code></td><td>End of the name</td></tr>
      <tr><td><code>/i</code></td><td>At the end &mdash; ignore upper/lowercase</td></tr>
    </tbody>
  </table>
  <div class="tip">You can test any of these in the <a href="#tryFilter">Try your filter</a> box above to see what matches before setting up your alert.</div>
  <p class="note">Not sure which to use? If you want alerts for one specific map, plain text is fine. If you want alerts for multiple maps or need more precision, use regex.</p>

  <h2 id="templates">Message templates</h2>
  <p><span class="section-label">Advanced</span></p>
  <p>The Message field supports conditional blocks so different lobbies can produce different messages:</p>
  <pre><code>{{#if map contains "dota"}}DotA game up!{{#else}}New lobby{{/if}}</code></pre>
  <p>Operators: <code>contains</code> (plain text) and <code>matches</code> (regex). Combine with <code>and</code> / <code>or</code>:</p>
  <pre><code>{{#if map contains "legion" and server contains "us"}}US Legion game!{{/if}}</code></pre>
  <p>Available fields: <code>name</code>, <code>map</code>, <code>host</code>, <code>server</code>, <code>slotsTaken</code>, <code>slotsTotal</code>. Conditionals can be nested.</p>

  <h2>/stop</h2>
  <p>Type <code>/stop</code> in the channel to remove the alert. No options needed. You can always set up a new alert with <code>/alert</code> at any time.</p>

  <h2>Troubleshooting</h2>
  <p>If the bot isn't sending alerts, the most common cause is missing permissions. The bot needs both of these in the channel:</p>
  <ul>
    <li><strong>Send Messages</strong></li>
    <li><strong>Embed Links</strong></li>
  </ul>
  <p>Check that the bot's role has these permissions in the channel settings. If you've restricted permissions for the channel (e.g. a read-only announcement channel), you may need to add an override for the bot specifically.</p>
  <p>If either permission is lost after the alert is created, the alert will be automatically stopped.</p>

  <script type="module">
  const input = document.getElementById("tryInput");
  const info = document.getElementById("matchInfo");
  const errorEl = document.getElementById("tryError");
  const list = document.getElementById("matchList");
  let debounce;

  const escapeHtml = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  // Parse a /pattern/flags string into a RegExp, or null if invalid
  function parseRegex(q) {
    const m = q.match(/^\\/(.+)\\/(\\w*)$/);
    if (!m) return null;
    try { return new RegExp(m[1], m[2] || undefined) }
    catch (e) { return e }
  }

  // Example chips (already next to the input, no scroll needed)
  document.getElementById("tryExamples").addEventListener("click", e => {
    const chip = e.target.closest(".try-chip");
    if (!chip) return;
    input.value = chip.dataset.value;
    input.focus();
    clearTimeout(debounce);
    doSearch();
  });

  // Clickable regex examples in the docs
  document.addEventListener("click", e => {
    const el = e.target.closest(".tryable");
    if (!el) return;
    tryValue(el.dataset.try);
  });

  function flash(el, quick) {
    const cls = quick ? "flash-quick" : "flash";
    el.classList.remove("flash", "flash-quick");
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function isInView(el) {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  }

  function tryValue(value) {
    input.value = value;
    const box = input.closest(".try-it");
    if (isInView(box)) {
      flash(box, true);
      input.focus();
      clearTimeout(debounce);
      doSearch();
    } else {
      box.scrollIntoView({ behavior: "smooth", block: "center" });
      flash(box);
      clearTimeout(debounce);
      debounce = setTimeout(() => { input.focus(); doSearch(); }, 400);
    }
  }

  // Smooth-scroll anchor links with highlight
  document.addEventListener("click", e => {
    const a = e.target.closest("a[href^='#']");
    if (!a) return;
    const target = document.querySelector(a.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    flash(target);
  });

  input.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(doSearch, 200);
  });

  async function doSearch() {
    const q = input.value.trim();
    errorEl.hidden = true;
    if (!q) {
      info.textContent = "";
      list.innerHTML = "";
      return;
    }

    // Client-side regex validation
    const regexResult = parseRegex(q);
    if (regexResult instanceof Error) {
      info.textContent = "";
      list.innerHTML = "";
      errorEl.hidden = false;
      errorEl.textContent = "Invalid regex: " + regexResult.message;
      return;
    }

    const params = new URLSearchParams({limit: "20", map: q});
    try {
      const res = await fetch("/lobbies?" + params, {headers: {accept: "application/json"}});
      const data = await res.json();
      const lobbies = data.lobbies;
      const hasMore = data.hasMore;
      if (!lobbies.length) {
        info.innerHTML = "No current lobbies match. That's fine &mdash; the bot will notify you when one appears.";
        list.innerHTML = "";
        return;
      }
      info.innerHTML = \`<span class="count">\${lobbies.length}\${hasMore ? "+" : ""}</span> matching lobb\${lobbies.length === 1 ? "y" : "ies"} right now\`;
      list.innerHTML = lobbies.map(l => {
        const mapHtml = highlightMatch(escapeHtml(l.map), q);
        return \`<li><span class="map-name">\${mapHtml}</span><span class="lobby-meta">\${l.host} &middot; \${l.server} &middot; \${l.slotsTaken}/\${l.slotsTotal}</span></li>\`;
      }).join("");
    } catch {
      info.textContent = "Could not fetch lobbies.";
      list.innerHTML = "";
    }
  }

  function highlightMatch(html, query) {
    try {
      const parsed = parseRegex(query);
      let re;
      if (parsed instanceof RegExp) {
        const flags = parsed.flags.includes("i") ? "gi" : "g";
        re = new RegExp("(" + parsed.source + ")", flags);
      } else {
        re = new RegExp("(" + query.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&") + ")", "gi");
      }
      return html.replace(re, '<span class="highlight">$1</span>');
    } catch { return html }
  }
  </script>
</body>
</html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
