/**
 * Zero-dependency static file server for local development.
 * Usage: node scripts/serve.js [port]   (defaults to 5500)
 */
"use strict";
var http = require("http");
var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var PORT = Number(process.argv[2]) || 5500;

var MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

var server = http.createServer(function (req, res) {
  var reqPath = decodeURIComponent(req.url.split("?")[0]);
  if (reqPath === "/") reqPath = "/index.html";
  var filePath = path.join(ROOT, reqPath);

  // Prevent escaping the project root.
  if (filePath.indexOf(ROOT) !== 0) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found: " + reqPath);
      return;
    }
    var ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, function () {
  console.log("Serving " + ROOT + " at http://localhost:" + PORT + "/");
});
