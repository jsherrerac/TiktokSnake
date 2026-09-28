'use strict';

/* Servidor WebSocket mínimo (RFC 6455, solo mensajes de texto JSON) montado sobre un servidor HTTP.
   Sin dependencias: así el puente arranca aunque no se haya hecho `npm install`.
   Cada cliente se presenta con { kind: 'hello', role: 'game' | 'control' }. */

const crypto = require('crypto');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PING_INTERVAL_MS = 20000;

function encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

let nextClientId = 1;

class WsClient {
  constructor(socket, remote) {
    this.id = nextClientId++;
    this.socket = socket;
    this.remote = remote;
    this.role = 'unknown';
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.awaitingPong = false;
  }

  send(obj) {
    if (this.socket.destroyed) return;
    this.socket.write(encodeFrame(0x1, Buffer.from(JSON.stringify(obj), 'utf8')));
  }

  close() {
    if (!this.socket.destroyed) this.socket.end(encodeFrame(0x8, Buffer.alloc(0)));
  }
}

// Procesa los frames del navegador (siempre enmascarados). Devuelve los mensajes de texto completos.
function readFrames(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);
  const messages = [];
  while (client.buffer.length >= 2) {
    const b = client.buffer;
    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (b.length < 4) break;
      len = b.readUInt16BE(2);
      offset = 4;
    } else if (len === 127) {
      if (b.length < 10) break;
      len = Number(b.readBigUInt64BE(2));
      offset = 10;
    }
    const maskLen = masked ? 4 : 0;
    if (b.length < offset + maskLen + len) break; // frame incompleto: esperar más datos
    const mask = masked ? b.subarray(offset, offset + 4) : null;
    const payload = Buffer.from(b.subarray(offset + maskLen, offset + maskLen + len));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    client.buffer = b.subarray(offset + maskLen + len);

    if (opcode === 0x8) {
      client.close();
      break;
    } else if (opcode === 0x9) {
      client.socket.write(encodeFrame(0xa, payload)); // ping -> pong
    } else if (opcode === 0xa) {
      client.awaitingPong = false;
    } else if (opcode === 0x1 || opcode === 0x0) {
      // texto (0x1) o continuación (0x0) de un mensaje fragmentado
      client.fragments.push(payload);
      if (fin) {
        messages.push(Buffer.concat(client.fragments).toString('utf8'));
        client.fragments = [];
      }
    }
  }
  return messages;
}

// Monta el WebSocket en `server`. Callbacks: onConnect(client), onMessage(client, obj), onClose(client).
function attachWebSocketServer(server, { onConnect, onMessage, onClose, log }) {
  const clients = new Set();

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') {
      socket.destroy();
      return;
    }
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    socket.setNoDelay(true);
    const client = new WsClient(socket, req.socket.remoteAddress);
    clients.add(client);
    onConnect(client);

    socket.on('data', (chunk) => {
      for (const text of readFrames(client, chunk)) {
        let msg;
        try {
          msg = JSON.parse(text);
        } catch (e) {
          log('ws', `mensaje no JSON del cliente ${client.id}: ${text.slice(0, 80)}`);
          continue;
        }
        onMessage(client, msg);
      }
    });
    const drop = () => {
      if (!clients.delete(client)) return;
      onClose(client);
    };
    socket.on('close', drop);
    socket.on('error', drop);
  });

  // Ping periódico: si un cliente no contesta al anterior, se da por muerto
  const timer = setInterval(() => {
    for (const client of clients) {
      if (client.awaitingPong) {
        client.socket.destroy();
        continue;
      }
      client.awaitingPong = true;
      if (!client.socket.destroyed) client.socket.write(encodeFrame(0x9, Buffer.alloc(0)));
    }
  }, PING_INTERVAL_MS);
  timer.unref();

  return {
    clients,
    broadcast(obj, role) {
      for (const client of clients) {
        if (!role || client.role === role) client.send(obj);
      }
    },
    count(role) {
      let n = 0;
      for (const client of clients) if (client.role === role) n++;
      return n;
    },
  };
}

module.exports = { attachWebSocketServer };
