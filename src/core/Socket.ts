import { io } from "socket.io-client";

const socket = io(process.env.REACT_APP_SERVER_URL);

socket.on("connect", () => {
  console.log(`Connected to server URL ${process.env.REACT_APP_SERVER_URL} with socket ID: ${socket.id}`);
});

export default socket;
