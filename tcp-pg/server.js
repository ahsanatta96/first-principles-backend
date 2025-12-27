const net = require("net");
const fs = require("fs");
const redis = require("./redis-client");

const PORT = 3001;
const IDLE_TIMEOUT_MS = 300 * 1000;

const clients = new Map();
const rooms = new Map();

// Creating the server
const server = net.createServer((socket) => {
  let step = 0;
  let username = "";

  socket.write("Enter username: ");

  socket.on("data", async (data) => {
    const input = data.toString().trim();

    if (!clients.has(socket)) {
      if (step === 0) {
        username = input;

        if ([...clients.values()].includes(username)) {
          socket.write("Username already connected. Disconnecting...\n");
          return socket.end();
        }

        socket.write("Enter password: ");
        step++;
        return;
      } else if (step === 1) {
        const password = input;

        const storedPassword = await redis.hget(`user:${username}`, "password");

        if (storedPassword) {
          if (storedPassword === password) {
            socket.write("Authenticated. Welcome!\n");
            clients.set(socket, username);
          } else {
            socket.write("Authentication failed. Disconnecting...\n");
            return socket.end();
          }
        } else {
          await redis.hset(`user:${username}`, "password", password);
          socket.write("User created and authenticated!\n");
          clients.set(socket, username);
        }

        step++;
        return;
      }
    }

    if (!input.startsWith("/")) {
      socket.write("Please use commands like /join, /leave, /msg\n");
      return;
    }
    const [command, ...args] = input.split(" ");
    switch (command) {
      case "/join":
        const roomName = args[0];
        joinRoom(roomName, socket);
        break;
      case "/leave":
        const leaveRoomName = args[0];
        leaveRoom(leaveRoomName, socket);
        break;
      case "/msg":
        const messageRoom = args[0];
        const message = args.slice(1).join(" ");
        broadcastToRoom(messageRoom, message, socket);
        break;

      default:
        socket.write("Unknown command\n");
    }
  });

  socket.on("error", (err) => {
    console.log(`Error ${socket.remoteAddress}: ${err}`);
  });

  socket.on("close", () => {
    clients.delete(socket);
    for (const room of rooms.values()) {
      room.delete(socket);
    }
  });
});

// On connection
server.on("connection", (socket) => {
  socket.setTimeout(IDLE_TIMEOUT_MS); // Idle connection timeout
  socket.on("timeout", () => {
    console.log("Socket timed out:", socket.remoteAddress, socket.remotePort);
    socket.end("Idle timeout, closing connection.\n");
  });
});

server.listen(PORT, () => console.log(`Server is listening on port: ${PORT}`));
server.maxConnections = 3;

// Graceful shutdown
const shutdown = () => {
  console.log("Shutting down the server...");
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 5000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Memory Usage
const logMemoryUsage = () => {
  const mem = process.memoryUsage();
  console.log(
    `Memory Usage - RSS: ${Math.round(
      mem.rss / 1024 / 1024
    )} MB, HeapUsed: ${Math.round(
      mem.heapUsed / 1024 / 1024
    )} MB, HeapTotal: ${Math.round(mem.heapTotal / 1024 / 1024)} MB`
  );
};
setInterval(logMemoryUsage, 10 * 1000);

// File descriptors count
const logFileDescriptors = () => {
  const pid = process.pid;
  const fdCount = fs.readdirSync(`/proc/${pid}/fd`).length;
  console.log(`Open file descriptors: ${fdCount}`);
};
setInterval(logFileDescriptors, 10 * 1000);

// Helpers
function joinRoom(roomName, socket) {
  if (!rooms.has(roomName)) {
    rooms.set(roomName, new Set());
  }

  const room = rooms.get(roomName);
  room.add(socket);
  socket.write(`Joined room: ${roomName}`);
}

function broadcastToRoom(roomName, message, excludeSocket = null) {
  if (!rooms.has(roomName)) return;

  const room = rooms.get(roomName);
  for (const sock of room) {
    if (sock !== excludeSocket) {
      const canWrite = sock.write(message + "\n");
      if (!canWrite) {
        console.log(`Backpressure detected for client ${sock.remotePort}`);
        sock.once("drain", () =>
          console.log(`Buffer drained for ${sock.remotePort}`)
        );
      }
    }
  }
}

function leaveRoom(roomName, socket) {
  if (!rooms.has(roomName)) return;
  const room = rooms.get(roomName);
  room.delete(socket);
  if (room.size === 0) {
    room.delete(roomName);
  }
}

// Broadcast the message to all connected clients
const broadcastMessage = (sender, message) => {
  for (const client of clients) {
    if (client !== sender) {
      const canWrite = client.write(message);
      if (!canWrite) {
        console.log(`Backpressure detected for client ${client.remotePort}`);
      }
      client.on("drain", () => {
        console.log(`Buffer drained for client ${client.remotePort}`);
      });
    }
  }
};
