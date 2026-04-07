import { getCachedLobbies, stats } from "../../liveLobbies.ts";
import { getDataSource, Lobby } from "../../sources/lobbies.ts";
import { Handler } from "../types.ts";

export const formatTime = (
  created?: number,
  style: Intl.RelativeTimeFormatStyle = "narrow",
) => {
  if (!created) return "";

  const diff = Math.round(Date.now() / 1000) - created;

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "always", style });

  const factor = {
    days: 60 * 60 * 24,
    hours: 60 * 60,
    minutes: 60,
    seconds: 1,
  };

  const unit = diff > 60 * 60 * 23.5
    ? "days"
    : diff > 60 * 60 * 1.5
    ? "hours"
    : diff > 60 * 1.5
    ? "minutes"
    : "seconds";
  return rtf.format(Math.round(-diff / factor[unit]), unit);
};

const lobbySort = (a: Lobby, b: Lobby) =>
  (a.created && b.created)
    ? b.created - a.created
    : a.created
    ? 1
    : b.created
    ? -1
    : 0;

export const getStatus: Handler = () => {
  const dataSource = getDataSource();
  const wc3StatsStatus = (dataSource === "none" || dataSource === "wc3maps")
    ? "down"
    : "up";
  const showWc3Maps = dataSource === "wc3maps" || dataSource === "none";
  const wc3MapsStatus = dataSource === "wc3maps" ? "up" : "down";
  const allLobbies = [...getCachedLobbies()].sort(lobbySort);
  const lobbies = allLobbies.slice(0, 100);

  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>w3xio - Live Lobbies</title>
  <link rel="icon" type="image/png" href="data:image/png;base64,iVBORw0KGgo=">
  <style>
  *, *::before, *::after { box-sizing: border-box }
  :root {
    color-scheme: dark;
    background-color: #111;
    color: #bbb;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 14px;
  }
  body { margin: 0; padding: 24px; max-width: 1200px; margin: 0 auto }
  header { margin-bottom: 20px }
  header h1 { color: #fff; font-size: 20px; margin: 0 0 8px; font-weight: 500 }
  header h1 a { color: #fff; text-decoration: none }
  header h1 a:hover { color: #7bc0ff }
  header h1 .breadcrumb { color: #666; font-weight: 400 }
  .meta { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: #666; margin-bottom: 16px }
  .meta span { white-space: nowrap }
  .meta .up { color: #4ec97a }
  .meta .down { color: #e05252 }
  table { width: 100%; border-collapse: collapse; table-layout: fixed }
  thead { position: sticky; top: 0; z-index: 1; background: #111 }
  th {
    text-align: left;
    font-weight: 500;
    color: #888;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 8px 10px;
    border-bottom: 1px solid #2a2a2a;
  }
  td { padding: 6px 10px; border-bottom: 1px solid #1e1e1e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  tr:hover td { background: #1a1a1a }
  .col-map { width: 28% }
  .col-name { width: 22% }
  .col-host { width: 12% }
  .col-realm { width: 8% }
  .col-created { width: 10% }
  .col-players { width: 8% }
  .col-status { width: 6%; text-align: center }
  .col-tracked { width: 6%; text-align: center }
  input {
    appearance: none;
    background: transparent;
    border: none;
    font: inherit;
    color: #ccc;
    width: 100%;
    padding: 6px 0;
  }
  input[type=text] { border-bottom: 1px solid #333 }
  input[type=text]:focus { border-bottom: 1px solid #5b9bd5; outline: none }
  input[type=text]::placeholder { color: #444 }
  input[type=checkbox] {
    margin: 0 auto;
    display: block;
    width: 16px;
    height: 16px;
    border: 1px solid #444;
    border-radius: 3px;
    cursor: pointer;
  }
  input[type=checkbox]:checked { background: #5b9bd5; border-color: #5b9bd5 }
  input[type=checkbox]:checked::before {
    content: "\\2713";
    display: block;
    text-align: center;
    line-height: 16px;
    font-size: 11px;
    color: #111;
  }
  .filter-row td { padding: 2px 10px 8px; border-bottom: 1px solid #2a2a2a }
  .status-dot { font-size: 10px }
  .players { font-variant-numeric: tabular-nums }
  </style>
  <script type="module">
  import morphdom from "https://esm.sh/morphdom";
  const lobbySort = ${lobbySort.toString()};
  const formatTime = ${formatTime.toString()};

  let lobbies = ${JSON.stringify(lobbies)};
  let total = ${allLobbies.length};
  let hasMore = ${allLobbies.length > 100};
  let lastUpdate = ${stats.lastDataUpdate ?? "undefined"};
  let fetching = false;
  let prevFilterKey = "";

  const PAGE = 100;

  const buildQuery = (offset = 0, limit = PAGE) => {
    const params = new URLSearchParams({limit: String(limit), offset: String(offset)});
    for (const key of ["map", "host", "name", "server"]) {
      const val = document.getElementById(key).value;
      if (val) params.set(key, val);
    }
    if (document.getElementById("alive").checked) params.set("alive", "1");
    if (document.getElementById("tracked").checked) params.set("tracked", "1");
    return params;
  };

  const fetchPage = async (offset = 0, limit = PAGE) => {
    const result = await fetch("/lobbies?" + buildQuery(offset, limit), {headers: {accept: "application/json"}});
    const data = await result.json();
    if (offset === 0) {
      lobbies = data.lobbies.sort(lobbySort);
    } else {
      lobbies = lobbies.concat(data.lobbies.sort(lobbySort));
    }
    total = data.total;
    hasMore = data.hasMore;
    lastUpdate = data.lastUpdate;
  };

  const refresh = () => fetchPage(0, lobbies.length || PAGE).then(render);

  const fetchMore = async () => {
    if (fetching || !hasMore) return;
    fetching = true;
    try {
      await fetchPage(lobbies.length);
      render();
    } finally { fetching = false }
  };

  setInterval(refresh, 10000);

  const getFilterKey = () => {
    return ["map", "host", "name", "server"].map(k => document.getElementById(k).value).join("\\0")
      + "\\0" + document.getElementById("tracked").checked
      + "\\0" + document.getElementById("alive").checked;
  };

  const render = () => {
    document.getElementById("lastUpdate").textContent = formatTime(Math.round(lastUpdate/1000), "long");
    document.getElementById("lobbyCount").textContent = total;

    morphdom(document.querySelector("tbody"), \`<tbody>\${lobbies.map(l => \`<tr id="\${l.id}">
      <td class="col-map" title="\${l.map}">\${l.map}</td>
      <td class="col-name" title="\${l.name}">\${l.name}</td>
      <td class="col-host">\${l.host}</td>
      <td class="col-realm">\${l.server}</td>
      <td class="col-created">\${l.created ? formatTime(l.created) : ""}</td>
      <td class="col-players players">\${l.slotsTaken} / \${l.slotsTotal}</td>
      <td class="col-status"><span class="status-dot">\${l.dead ? "\\u{1F534}" : l.deadAt ? "\\u{1F7E0}" : "\\u{1F7E2}"}</span></td>
      <td class="col-tracked">\${l.messages.length || ""}</td>
    </tr>\`).join("\\n")}</tbody>\`);
  };

  const update = () => {
    const filterKey = getFilterKey();
    if (filterKey !== prevFilterKey) {
      prevFilterKey = filterKey;
      fetchPage(0).then(render);
    }
  };

  window.addEventListener("scroll", () => {
    if (!hasMore) return;
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) {
      fetchMore();
    }
  });

  globalThis.update = update;

  setInterval(render, 1000);
  </script>
</head>
<body>
  <header>
    <h1><a href="/">Live Lobbies</a> <span class="breadcrumb">&rsaquo; Status</span></h1>
  </header>
  <div class="meta">
    <span><a href="https://wc3stats.com/gamelist" target="_blank" rel="noopener">wc3stats &#11194;</a> <span class="${wc3StatsStatus}">${wc3StatsStatus}</span></span>
    ${
      showWc3Maps
        ? `<span><a href="https://wc3maps.com/live" target="_blank" rel="noopener">wc3maps &#11194;</a> <span class="${wc3MapsStatus}">${wc3MapsStatus}</span></span>`
        : ""
    }
    <span>Updated <span id="lastUpdate">${
      formatTime(Math.round(stats.lastDataUpdate / 1000), "long")
    }</span></span>
    <span>Lobbies: <span id="lobbyCount">${allLobbies.length}</span></span>
  </div>
  <table>
    <thead>
      <tr>
        <th class="col-map">File</th>
        <th class="col-name">Game name</th>
        <th class="col-host">Host</th>
        <th class="col-realm">Realm</th>
        <th class="col-created">Created</th>
        <th class="col-players">Players</th>
        <th class="col-status">Status</th>
        <th class="col-tracked">Tracked</th>
      </tr>
      <tr class="filter-row">
        <td><input type="text" id="map" placeholder="filter file..." oninput="update()" /></td>
        <td><input type="text" id="name" placeholder="filter name..." oninput="update()" /></td>
        <td><input type="text" id="host" placeholder="filter host..." oninput="update()" /></td>
        <td><input type="text" id="server" placeholder="us, eu, kr" oninput="update()" /></td>
        <td></td>
        <td></td>
        <td><input type="checkbox" id="alive" oninput="update()" title="Alive only" /></td>
        <td><input type="checkbox" id="tracked" oninput="update()" title="Tracked only" /></td>
      </tr>
    </thead>
    <tbody>
${
      lobbies.map((l) =>
        `      <tr id="${l.id}">
        <td class="col-map" title="${l.map}">${l.map}</td>
        <td class="col-name" title="${l.name}">${l.name}</td>
        <td class="col-host">${l.host}</td>
        <td class="col-realm">${l.server}</td>
        <td class="col-created">${l.created ? formatTime(l.created) : ""}</td>
        <td class="col-players players">${l.slotsTaken} / ${l.slotsTotal}</td>
        <td class="col-status"><span class="status-dot">${
          l.dead ? "\u{1F534}" : l.deadAt ? "\u{1F7E0}" : "\u{1F7E2}"
        }</span></td>
        <td class="col-tracked">${l.messages.length || ""}</td>
      </tr>`
      ).join("\n")
    }
    </tbody>
  </table>
</body>
</html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
};
