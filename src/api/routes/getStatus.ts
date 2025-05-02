import { process, stats } from "../../liveLobbies.ts";
import { db } from "../../sources/kv.ts";
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

export const getStatus: Handler = async () => {
  const dataSource = getDataSource();
  const wc3StatsStatus = (dataSource === "none" || dataSource === "wc3maps")
    ? "down"
    : "up";
  const showWc3Maps = dataSource === "wc3maps" || dataSource === "none";
  const wc3MapsStatus = dataSource === "wc3maps" ? "up" : "down";
  const lobbies = await db.lobbies.getMany().then((v) =>
    v.result.map((v) => v.value).sort(lobbySort)
  );

  return new Response(
    `
<head
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" href="data:image/png;base64,iVBORw0KGgo=">
  <style>
  :root {
    color-scheme: dark;
    background-color: #181818;
    color: #ccc;
    font-family: 'Calibri', 'Candara', 'Segoe', 'Segoe UI', 'Optima', 'Arial', sans-serif;
  }
  th { padding: 0 4px; box-sizing: border-box }
  a { color: #2472c8; text-decoration: none }
  a:hover { color: #11a8cd }
  a:visited { color: #bc3fbc }
  input {
    appearance: none;
    background: #222;
    border: none;
    font: inherit;
    color: white;
  }
  input[type=text] {
    width: 100%;
    border-bottom: 2px solid #444;
  }
  input[type=text]:focus {
    border-bottom: 2px solid white;
    outline: none;
  }
  input[type=checkbox] {
    margin: 0;
    width: 20px;
    height: 20px;
  }
  input[type=checkbox]:checked::before {
    content: "✓";
    display: block;
    text-align: center;
    line-height: 20px;
    color: white;
  }
  </style>
  <script type="module">
  import morphdom from "https://esm.sh/morphdom";
  const process = ${process.toString()};
  const lobbySort = ${lobbySort.toString()};
  const formatTime = ${formatTime.toString()};

  let lobbies = ${JSON.stringify(lobbies)};
  let lastUpdate = ${stats.lastDataUpdate ?? "undefined"};
  setInterval(async () => {
    const result = await fetch("/lobbies", {headers: {accept: "application/json"}});
    const data = await result.json();
    lobbies = data.lobbies.sort(lobbySort);
    lastUpdate = data.lastUpdate;
  }, 10000);


  const update = () => {
    for (const th of document.querySelectorAll("th"))
      th.style.width = th.getBoundingClientRect().width;

    const rules = ["map", "host", "name", "server"]
      .map(key => ({key, value: document.getElementById(key).value}))
      .filter(v => v.value)
      .map(({key, value}) => {
        const [, pattern, flags] = value.match(/^\\/(.*)\\/(\\w*)$/) ?? [];
        return {key, value: pattern ? new RegExp(pattern, flags || undefined) : value};
      });
    const tracked = document.getElementById("tracked").checked;
    const alive = document.getElementById("alive").checked;
    const filtered = lobbies.filter(l => process(rules, l) && (!alive || !l.deadAt) && (!tracked || l.messages.length));

    document.getElementById("lastUpdate").textContent = formatTime(Math.round(lastUpdate/1000), "long");
    document.getElementById("lobbyCount").textContent = filtered.length;

    morphdom(document.querySelector("tbody"), \`<tbody>\${filtered.map(l => \`<tr id="\${l.id}">
      <td>\${l.map}</td>
      <td>\${l.name}</td>
      <td>\${l.host}</td>
      <td>\${l.server}</td>
      <td>\${l.created ? formatTime(l.created) : ""}</td>
      <td>\${l.slotsTaken} / \${l.slotsTotal}</td>
      <td>\${l.dead ? "🔴" : l.deadAt ? "🟠" : "🟢"}</td>
      <td>\${l.messages.length || ""}</td>
    </tr>\`).join("\\n")}</tbody>\`);
  };

  globalThis.update = update;

  setInterval(update, 1000);
  </script>
</head>
<body>
  <p>Provider: ${dataSource}</p>
  <p><a href="https://wc3stats.com/gamelist">wc3stats.com</a>: ${wc3StatsStatus}</p>
  ${
      showWc3Maps
        ? `<p><a href="https://wc3maps.com/live">wc3maps.com</a>: ${wc3MapsStatus}</p>`
        : ""
    }
  <p>Last lobby update: <span id="lastUpdate">${
      formatTime(Math.round(stats.lastDataUpdate / 1000), "long")
    }</span></p>
  <p>Lobbies: <span id="lobbyCount">${lobbies.length}</span></p>
  <table>
    <thead>
      <tr>
        <th>Map</th>
        <th>Game name</th>
        <th>Host</th>
        <th>Realm</th>
        <th>Created</th>
        <th>Players</th>
        <th>Status</th>
        <th>Tracked</th>
      </tr>
      <tr>
        <td><input type="text" size="1" id="map" placeholder="/tree.*tag/i" oninput="update()" /></td>
        <td><input type="text" size="1" id="name" placeholder="-aram" oninput="update()" /></td>
        <td><input type="text" size="1" id="host" placeholder="verit" oninput="update()" /></td>
        <td><input type="text" size="1" id="server" placeholder="us, eu, or kr" oninput="update()" style="min-width: 86px" /></td>
        <td></td>
        <td></td>
        <td><input type="checkbox" id="alive" oninput="update()" /></td>
        <td><input type="checkbox" id="tracked" oninput="update()" /></td>
      </tr>
    </thead>
    <tbody>
${
      lobbies.map((l) =>
        `      <tr id="${l.id}">
        <td>${l.map}</td>
        <td>${l.name}</td>
        <td>${l.host}</td>
        <td>${l.server}</td>
        <td>${l.created ? formatTime(l.created) : ""}</td>
        <td>${l.slotsTaken} / ${l.slotsTotal}</td>
        <td>${l.dead ? "🔴" : l.deadAt ? "🟠" : "🟢"}</td>
        <td>${l.messages.length || ""}</td>
      </tr>`
      ).join("\n")
    }
    </tbody>
  </table>
</body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
};
