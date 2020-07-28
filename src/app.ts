import { serve } from "https://deno.land/std/http/server.ts";
import {
  acceptWebSocket,
  isWebSocketCloseEvent,
  isWebSocketPingEvent,
  WebSocket,
} from "https://deno.land/std/ws/mod.ts";

const server = serve({ port: 8000 });
const connections = new Array<{ name: string, ws: WebSocket }>();
console.log("http://localhost:8000/");

async function handleWs(sock: WebSocket) {
  console.log("socket connected!");

  try {
    for await (const ev of sock) {
      if (typeof ev === "string") {
        // text message
        //console.log("ws:Text", ev);
        const data = JSON.parse(ev);

        if (data.type == "register") {
          connections.push({ name: data.name, ws: sock });

          const registered = JSON.stringify({
            type: "registered",
            message: `${data.name}, you are registered.`
          });

          sock.send(registered);

          const online_users = JSON.stringify({
            type: 'online',
            message: { users: connections.map((connection) => connection.name) },
          });

          sock.send(online_users);

          const message = JSON.stringify({ type: 'join', message: data.name });

          for await (const websocket of connections) {
            if (websocket.ws != sock) {
              websocket.ws.send(message);
            }
          }
        } else {
          for await (const websocket of connections) {
            websocket.ws.send(ev);
          }
        }
      } else if (ev instanceof Uint8Array) {
        // binary message
        console.log("ws:Binary", ev);
      } else if (isWebSocketPingEvent(ev)) {
        const [, body] = ev;
        // ping
        console.log("ws:Ping", body);
      } else if (isWebSocketCloseEvent(ev)) {
        // close
        const { code, reason } = ev;
        console.log("ws:Close", code, reason);

        const current_connection = connections.filter((c) => c.ws == sock);

        if (current_connection.length != 1) {
          return false;
        }

        const message = JSON.stringify({ type: "left", message: current_connection[0].name });

        for await (const websocket of connections) {
          if (websocket.ws != sock) {
            websocket.ws.send(message);
          }
        }

        connections.splice(connections.indexOf(current_connection[0]), 1);
      }
    }
  } catch (err) {
    console.error(`failed to receive frame: ${err}`);

    if (!sock.isClosed) {
      await sock.close(1000).catch(console.error);
    }
  }
}

if (import.meta.main) {
  for await (const req of server) {
    const { conn, r: bufReader, w: bufWriter, headers } = req;

    if (req.method == 'GET' && req.url == '/chat') {
      req.respond({
        headers: new Headers({
          'content-type': 'text/html'
        }),
        body: await Deno.open('./index.html'),
      });
    } else {
      acceptWebSocket({
        conn,
        bufReader,
        bufWriter,
        headers,
      })
        .then(handleWs)
        .catch(async (err) => {
          //console.log(req);
          console.error(`failed to accept websocket: ${err}`);
          await req.respond({ body: "Not found", status: 400 });
        });
    }
  }
}
