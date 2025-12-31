const net = require("net");

const PORT = 3001;

// Routing table
const routes = {
  "GET /": () => {
    const body = "Welcome to the TCP HTTP server\n";
    return {
      statusCode: 200,
      reasonPhrase: "OK",
      body,
      contentType: "text/plain",
    };
  },

  "POST /echo": ({ body: requestBody }) => {
    console.log("BODYYY:", requestBody);
    return {
      statusCode: 201,
      reasonPhrase: "Created",
      body: `You sent: ${requestBody}\n`,
      contentType: "text/plain",
    };
  },

  "POST /stream": ({ socket, body: requestBody }) => {
    socket.write(
      "HTTP/1.1 200 OK\r\n" +
        "Transfer-Encoding: chunked\r\n" +
        "Content-Type: text/plain\r\n" +
        "Connection: close\r\n\r\n"
    );

    const chunks = requestBody.match(/.{1,5}/g) || [];
    let i = 0;

    const interval = setInterval(() => {
      if (i >= chunks.length) {
        socket.write("0\r\n\r\n");
        socket.end();
        clearInterval(interval);
        return;
      }
      const chunk = chunks[i];
      const sizeHex = Buffer.byteLength(chunk).toString(16);
      socket.write(`${sizeHex}\r\n${chunk}\r\n`);
      i++;
    }, 500);
  },
};

// Server
const server = net.createServer((socket) => {
  let buffer = "";

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");

    while (true) {
      const headerEndIndex = buffer.indexOf("\r\n\r\n");
      if (headerEndIndex === -1) break;

      const headerPart = buffer.slice(0, headerEndIndex);
      const lines = headerPart.split("\r\n");
      const [method, path, version] = lines[0].split(" ");

      const headers = {};
      lines.slice(1).forEach((line) => {
        if (!line.includes(":")) return;
        const [key, ...rest] = line.split(":");
        headers[key.toLowerCase().trim()] = rest.join(":").trim();
      });

      const isChunked =
        headers["transfer-encoding"]?.toLowerCase() === "chunked";
      let requestBody = "";
      let totalSize = headerEndIndex + 4;

      if (isChunked) {
        const result = parseChunkedBody(buffer.slice(headerEndIndex + 4));
        if (!result) break;

        requestBody = result.body;
        totalSize = headerEndIndex + 4 + result.offset;
      } else {
        const contentLength = Number(headers["content-length"] || 0);
        totalSize = headerEndIndex + 4 + contentLength;
        if (buffer.length < totalSize) break;
        requestBody = buffer.slice(headerEndIndex + 4, totalSize);
      }

      const key = `${method} ${path}`;
      const routeHandler = routes[key];

      if (routeHandler) {
        if (key === "POST /stream") {
          routeHandler({ socket, body: requestBody });
        } else {
          const { statusCode, reasonPhrase, body, contentType } = routeHandler({
            body: requestBody,
            headers,
          });
          const connectionHeader =
            headers["connection"]?.toLowerCase() || "keep-alive";
          const shouldClose = connectionHeader === "close";

          const response =
            `HTTP/1.1 ${statusCode} ${reasonPhrase}\r\n` +
            `Content-Length: ${Buffer.byteLength(body)}\r\n` +
            `Content-Type: ${contentType}\r\n` +
            `Connection: ${shouldClose ? "close" : "keep-alive"}\r\n\r\n` +
            body;

          socket.write(response);
          if (shouldClose) socket.end();
        }
      } else {
        // Route not found
        const body = "Not Found";
        const response =
          `HTTP/1.1 404 Not Found\r\n
          Content-Length: ${Buffer.byteLength(body)}\r\n
          Content-Type: text/plain\r\n
          Connection: close\r\n\r\n` + body;
        socket.write(response);
        socket.end();
      }

      buffer = buffer.slice(totalSize);
    }
  });

  socket.on("end", () => {
    console.log("Client disconnected");
  });
});

server.on("connection", (socket) => {
  console.log(`Client connected: ${socket.remoteAddress}`);
});

server.listen(PORT, () => console.log(`Server is listening on port ${PORT}`));

// Helper
function parseChunkedBody(buf) {
  let body = "";
  let offset = 0;

  while (true) {
    // Skipping leading CRLFs
    while (buf.startsWith("\r\n", offset)) {
      offset += 2;
    }

    const crlfIndex = buf.indexOf("\r\n", offset);
    if (crlfIndex === -1) return null;

    const chunkSizeHex = buf.slice(offset, crlfIndex).trim();
    const chunkSize = parseInt(chunkSizeHex, 16);

    if (isNaN(chunkSize)) return null;

    // Final chunk
    if (chunkSize === 0) {
      offset = crlfIndex + 4; // "0\r\n\r\n"
      return { body, offset };
    }

    const chunkStart = crlfIndex + 2;
    const chunkEnd = chunkStart + chunkSize;

    if (buf.length < chunkEnd + 2) return null;

    body += buf.slice(chunkStart, chunkEnd);
    offset = chunkEnd + 2; // Skipping trailing CRLF
  }
}
