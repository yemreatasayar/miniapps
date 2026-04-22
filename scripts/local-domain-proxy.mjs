import http from "node:http";
import net from "node:net";

const HOST_ROUTES = {
  "filtre.localhost": 4180,
  "miniapps.localhost": 4181,
  "pdf.localhost": 4183,
  "image.localhost": 4185,
  "video.localhost": 4186,
  "csv.localhost": 4187,
  "bg.localhost": 4188,
  "meta.localhost": 4191,
  "format.localhost": 4192,
  "dev.localhost": 4193,
  "stem.localhost": 4194,
};

function getTargetPort(hostHeader) {
  const hostname = (hostHeader ?? "").split(":")[0].toLowerCase();
  return HOST_ROUTES[hostname] ?? null;
}

function writeGatewayError(response, message) {
  response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

const server = http.createServer((request, response) => {
  const targetPort = getTargetPort(request.headers.host);

  if (!targetPort) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Unknown local domain.");
    return;
  }

  const proxyRequest = http.request(
    {
      hostname: "127.0.0.1",
      port: targetPort,
      method: request.method,
      path: request.url,
      headers: {
        ...request.headers,
        host: `127.0.0.1:${targetPort}`,
      },
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
      proxyResponse.pipe(response);
    }
  );

  proxyRequest.on("error", () => {
    writeGatewayError(response, `Upstream app on port ${targetPort} is not reachable.`);
  });

  request.pipe(proxyRequest);
});

server.on("upgrade", (request, socket, head) => {
  const targetPort = getTargetPort(request.headers.host);

  if (!targetPort) {
    socket.destroy();
    return;
  }

  const upstreamSocket = net.connect(targetPort, "127.0.0.1", () => {
    const headerLines = [];
    headerLines.push(`${request.method} ${request.url} HTTP/${request.httpVersion}`);

    for (const [key, value] of Object.entries(request.headers)) {
      if (value === undefined || key.toLowerCase() === "host") continue;

      if (Array.isArray(value)) {
        for (const item of value) {
          headerLines.push(`${key}: ${item}`);
        }
      } else {
        headerLines.push(`${key}: ${value}`);
      }
    }

    headerLines.push(`host: 127.0.0.1:${targetPort}`);
    headerLines.push("", "");

    upstreamSocket.write(headerLines.join("\r\n"));
    if (head.length > 0) {
      upstreamSocket.write(head);
    }

    socket.pipe(upstreamSocket).pipe(socket);
  });

  upstreamSocket.on("error", () => {
    socket.destroy();
  });

  socket.on("error", () => {
    upstreamSocket.destroy();
  });
});

server.listen(80, "127.0.0.1", () => {
  console.log(
    "Local domain proxy listening on http://miniapps.localhost, http://filtre.localhost, http://pdf.localhost, http://image.localhost, http://video.localhost, http://csv.localhost, http://bg.localhost, http://meta.localhost, http://format.localhost, http://dev.localhost and http://stem.localhost"
  );
});
