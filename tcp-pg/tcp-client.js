import net from "net";

const PORT = 3001;
const HOST = "127.0.0.1";

const socket = net.createConnection({ port: PORT, host: HOST }, () => {
  console.log("Connected to server");
});

// Flood server with messages
let count = 0;
const sendData = () => {
  const message = `Message ${count}\n`;
  const canWrite = socket.write(message);

  if (!canWrite) {
    console.log("Backpressure detected in client");
    socket.once("drain", () => {
      console.log("Client buffer drained");
      count++;
      setTimeout(sendData, 10); // small delay
    });
  } else {
    count++;
    setTimeout(sendData, 10); // keep sending
  }
};

// Start sending messages
sendData();

// Read server responses very slowly
socket.on("data", (data) => {
  setTimeout(() => {
    console.log("Received from server:", data.toString());
  }, 1000); // slow processing (1 sec delay)
});

socket.on("end", () => {
  console.log("Disconnected from server");
});
