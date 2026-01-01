const net = require("net");

const PORT = 3001;
const HOST = "127.0.0.1";

const socket = net.createConnection({ port: PORT, host: HOST }, () => {
  console.log(`Client connected`);
  sendRequest(socket);
});

let total = 0;
socket.on("data", (chunk) => {
  total += chunk.length;
  console.log(
    `[Client] Received chunk of ${chunk.length} bytes, total=${total}`
  );
});

function sendRequest(socket) {
  const request = "GET /flood HTTP/1.1\r\n" + "Host: 127.0.0.1\r\n\r\n";

  socket.write(request);
}
