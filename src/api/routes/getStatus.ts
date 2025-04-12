import { stats } from "../../liveLobbies.ts";
import { db } from "../../sources/kv.ts";
import { getDataSource } from "../../sources/lobbies.ts";
import { Handler } from "../types.ts";

export const getStatus: Handler = async ({ req }) => {
  const dataSource = getDataSource();
  const wc3StatsStatus = (dataSource === "none" || dataSource === "wc3maps")
    ? "down"
    : "up";
  const showWc3Maps = dataSource === "wc3maps" || dataSource === "none";
  const wc3MapsStatus = dataSource === "wc3maps" ? "up" : "down";
  const lastLobbyUpdate = `<script>
        (function() {
            var date = new Date(${stats.lastDataUpdate});

            // Format the date to the user's local timezone
            var localizedString = date.toLocaleString('en-US', {
                weekday: 'long', // e.g., Monday
                year: 'numeric',
                month: 'long', // e.g., December
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short' // e.g., PST
            });

            // Create a text node with the localized date string
            var textNode = document.createTextNode(localizedString);

            // Insert the text node after the script tag
            document.currentScript.parentNode.insertBefore(textNode, document.currentScript.nextSibling);
        })();
    </script>`;
  const lobbies = await db.lobbies.getMany().then((v) =>
    v.result.map((v) => v.value)
  );

  return new Response(
    `
        <head
            <meta charset="UTF-8">
            <link rel="icon" type="image/png" href="data:image/png;base64,iVBORw0KGgo=">
            <style>
                :root {
                    background-color: #181818;
                    color: #ccc;
                    font-family: 'Calibri', 'Candara', 'Segoe', 'Segoe UI', 'Optima', 'Arial', sans-serif;
                }
                a { color: #2472c8; text-decoration: none }
                a:hover { color: #11a8cd }
                a:visited { color: #bc3fbc }
            </style>
        </head>
        <body>
            <p>Provider: ${dataSource}</p>
            <p><a href="https://wc3stats.com/gamelist">wc3stats.com</a>: ${wc3StatsStatus}</p>
            ${
      showWc3Maps
        ? `<p><a href="https://wc3maps.com/live">wc3maps.com</a>: ${wc3MapsStatus}</p>`
        : ""
    }
            <p>Last lobby update: ${lastLobbyUpdate}</p>
            <p>Known lobbies:</p>
            <table>
                <thead>
                    <tr>
                        <th>Map</th>
                        <th>Game name</th>
                        <th>Host</th>
                        <th>Realm</th>
                        <th>Players</th>
                        <th>Status</th>
                        <th>Tracked</th>
                    </tr>
                </thead>
                <tbody>
                    ${
      lobbies.map((l) =>
        `   <tr>
                            <td>${l.map}</td>
                            <td>${l.name}</td>
                            <td>${l.host}</td>
                            <td>${l.server}</td>
                            <td>${l.slotsTaken} / ${l.slotsTotal}</td>
                            <td>${l.deadAt ? "🔴" : "🟢"}</td>
                            <td>${l.messages.length}</td>
                    </tr>`
      ).join("\n")
    }
                </tbody>
            </table>
        </body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
};
