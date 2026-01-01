const net = require("net");

const PORT = 3001;
const HOST = "127.0.0.1";
const CLIENT_COUNT = 5;

function createClient(id) {
  const socket = net.createConnection({ port: PORT, host: HOST }, () => {
    console.log(`[Client ${id}] Connected`);
    sendRequestSlowly(socket, id);
  });

  socket.on("data", (data) => {
    console.log(`[Client ${id}] Response:\n${data.toString()}`);
  });

  socket.on("end", () => {
    console.log(`[Client ${id}] Disconnected`);
  });

  socket.on("error", (err) => {
    console.error(`[Client ${id}] Error`, err.message);
  });
}

function sendRequestSlowly(socket, id) {
  const request =
    // "POST /echo HTTP/1.1\r\n" +
    "GET /flood HTTP/1.1\r\n" + "Host: 127.0.0.1\r\n\r\n";
  // "Content-Length: 11\r\n\r\n" +
  // "Hello World";

  let index = 0;

  const interval = setInterval(() => {
    if (index >= request.length) {
      clearInterval(interval);
      console.log(`[Client ${id}] Finished sending`);
      return;
    }

    socket.write(request[index]);
    index++;
  }, 150);
}

// Spawn clients
for (let i = 1; i <= CLIENT_COUNT; i++) {
  createClient(i);
}
