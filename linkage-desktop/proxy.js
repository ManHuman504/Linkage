const http = require('http');
const net = require('net');

const server = http.createServer((req, res) => {
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method not allowed for proxying');
});

server.on('connect', (req, clientSocket, head) => {
  const { port, hostname } = new URL(`http://${req.url}`);
  const serverSocket = net.connect(port || 443, hostname, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });
  serverSocket.on('error', (err) => {
    clientSocket.end();
  });
  clientSocket.on('error', (err) => {
    serverSocket.end();
  });
});

server.listen(8123, () => {
  console.log('Proxy started on port 8123');
});
