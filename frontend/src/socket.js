import { io } from 'socket.io-client';

const isLocalhost =
	window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? (isLocalhost ? 'http://localhost:3000' : window.location.origin);
export const socket = io(SERVER_URL, { transports: ['websocket'] });
