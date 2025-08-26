/// <reference lib="deno.unstable" />

const enc = new TextEncoder();

const NOTIFY_SOCKET = Deno.env.get("NOTIFY_SOCKET");

let notifySocket: Deno.DatagramConn | null = null;

/** Initialize datagram socket for systemd notifications */
function initNotifySocket() {
  if (!NOTIFY_SOCKET || notifySocket) return;

  try {
    // Create a datagram socket - we'll send to the systemd socket path
    notifySocket = Deno.listenDatagram({ transport: "unixpacket", path: "" });
  } catch (error) {
    console.debug(
      `[Watchdog] Failed to create notify socket: ${(error as Error).message}`,
    );
  }
}

async function sdNotify(state: string) {
  if (!NOTIFY_SOCKET) return;

  initNotifySocket();
  if (!notifySocket) return;

  try {
    // Abstract-namespace sockets start with "@"; replace with leading NUL
    const targetPath = NOTIFY_SOCKET.startsWith("@")
      ? `\0${NOTIFY_SOCKET.slice(1)}`
      : NOTIFY_SOCKET;

    await notifySocket.send(enc.encode(state), {
      transport: "unixpacket",
      path: targetPath,
    });
  } catch (error) {
    console.debug(`[Watchdog] Notify failed: ${(error as Error).message}`);
  }
}

/* ------------------------------------------------------------------------- */

/** Call once, as soon as the server is ready to accept players */
export async function notifyReady() {
  await sdNotify("READY=1");
}

export async function notifyHealthy() {
  await sdNotify("WATCHDOG=1");
}
