const express = require("express");
const { cpuUsage, memoryUsage } = require("node:process");
const { Worker } = require("worker_threads");

const app = express();
const port = process.env.PORT || 8080;
const list = [];
const workers = [];

const logRequest = (req) => {
  console.log(`Served a request for ${req.url}`);
};

const redirectToRoot = (res) => {
  res.writeHead(302, { location: "/" });
  res.end();
};

const computeIntensiveTask = (n) => {
  const worker = new Worker("./compute.js", { workerData: 46 });
  workers.push(worker);
  let text = "";
  worker.on("message", (result) => {
    text = result;
    workers.pop();
  });
  return text;
};

const showInfoAndEnd = (res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  res.write("<code>");
  res.write(`version: ${packageVersion()}<br />\n`);
  res.write(
    '<a href="/compute">Worker</a> threads:  ' + workers.length + "<br />\n",
  );
  res.write(
    '<a href="/leak">Memory</a> used (MiB): ' +
      (memoryUsedBytes() / 1024 / 1024).toFixed(2) +
      "<br />\n",
  );
  res.write(
    '<a href="/leak">Memory</a> free (MiB): ' +
      (memoryFreeBytes() / 1024 / 1024).toFixed(2) +
      "<br />\n",
  );
  res.write(
    '<a href="/leak">Memory</a> total (MiB): ' +
      (memoryLimitBytes() / 1024 / 1024).toFixed(2) +
      "<br />\n",
  );
  res.write('<a href="/clear">Clear</a> heap<br />\n');
  res.write('<a href="/env">Environment</a> variables<br />\n');
  res.end("</code>");
};

const memoryLimitBytes = () => {
  // strip the m off the end of the string
  const memoryLimit = process.env.MEMORY_LIMIT || "1024m";
  return parseInt(memoryLimit.slice(0, -1)) * 1024 * 1024;
};

const memoryUsedBytes = () => {
  return memoryUsage().rss;
};

const memoryFreeBytes = () => {
  return memoryLimitBytes() - memoryUsedBytes();
};

const consumeHalfMemoryFree = () => {
  // Allocate half of the free memory
  // This will trigger a memory limit error if the memory limit is reached
  // We push two arrays at a quarter of available memory because the V8
  // engine doesn't seem to consume memory when we push one large array'
  const halfMemoryFreeBytes = memoryFreeBytes() / 2;
  arraySize = Math.abs(halfMemoryFreeBytes / 8 / 2);
  list.push(new Array(arraySize).fill("x"));
  list.push(new Array(arraySize).fill("x"));
};

const clearMemory = () => {
  list.length = 0;
};

const packageVersion = () => {
  return process.env.npm_package_version;
};

const showEnvironment = (res) => {
  const env = JSON.stringify(process.env, null, 2);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  res.write("<pre>");
  res.write(`${env}`);
  res.end("</pre>");
};

app.get("/leak", (req, res) => {
  consumeHalfMemoryFree();
  redirectToRoot(res);
  logRequest(req);
});

app.get("/clear", (req, res) => {
  clearMemory();
  redirectToRoot(res);
  logRequest(req);
});

app.get("/compute", (req, res) => {
  text = computeIntensiveTask();
  redirectToRoot(res);
  logRequest(req);
});

app.get("/env", (req, res) => {
  text = computeIntensiveTask();
  showEnvironment(res);
  logRequest(req);
});

app.get("/", (req, res) => {
  showInfoAndEnd(res);
  logRequest(req);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
