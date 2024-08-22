const express = require("express");
const bodyParser = require("body-parser");
const { cpuUsage, memoryUsage } = require("node:process");
const { Worker } = require("worker_threads");
const redis = require("redis");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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
  updateInstanceInfo();
  return text;
};

const getRedisUrl = () => {
  if (process.env.VCAP_SERVICES) {
    const vcapServices = JSON.parse(process.env.VCAP_SERVICES);
    const pRedis = vcapServices["p-redis"];
    if (pRedis.length > 0) {
      const redisCreds = pRedis[0].credentials;
      return `redis://:${redisCreds.password}@${redisCreds.host}:${redisCreds.port}`;
    }
  }
  return "redis://localhost:6379";
};
console.log("Redis URL:", getRedisUrl());

const redisClient = redis.createClient({
  url: getRedisUrl(),
});

redisClient.on("error", (error) => {
  if (error) {
    console.error("ERROR***", error);
  } else {
    console.log("Redis connect.");
  }
});
const redisSubscriber = redisClient.duplicate();

redisClient.on("error", (error) => {
  console.error("Redis client error:", error);
});

redisSubscriber.on("message", (channel, message) => {
  console.log(`Received message on channel ${channel}: ${message}`);
});

async function initRedis() {
  await redisClient.connect();
  await redisSubscriber.connect();
  console.log("Redis connected.");

  const instanceIndex = process.env.INSTANCE_INDEX || "0";
  await redisSubscriber.subscribe(`instance:${instanceIndex}`, handleMessage);
}

initRedis().catch(console.error);

function handleMessage(message, channel) {
  console.log(`Received message on channel ${channel}: ${message}`);
  const instruction = JSON.parse(message);

  switch (instruction.type) {
    case "leak":
      consumeHalfMemoryFree();
      break;
    case "clear":
      clearMemory();
      break;
    case "compute":
      computeIntensiveTask(46); // Using a default value of 46
      break;
    default:
      console.log(`Unknown instruction type: ${instruction.type}`);
  }
}

async function updateInstanceInfo() {
  const instanceIndex = process.env.INSTANCE_INDEX || "0";
  const info = {
    workerThreads: workers.length,
    memoryUsed: (memoryUsedBytes() / 1024 / 1024).toFixed(2),
    memoryFree: (memoryFreeBytes() / 1024 / 1024).toFixed(2),
    memoryTotal: (memoryLimitBytes() / 1024 / 1024).toFixed(2),
    lastUpdate: Date.now().toString(),
  };
  await redisClient.hSet(`instance:${instanceIndex}:info`, info);
}

async function getInstanceInfo(instanceIndex) {
  return await redisClient.hGetAll(`instance:${instanceIndex}:info`);
}

const updateHeartbeat = async () => {
  const instanceIndex = process.env.INSTANCE_INDEX || "0";
  const timestamp = Date.now();
  try {
    await redisClient.hSet(
      "server_heartbeats",
      instanceIndex,
      timestamp.toString(),
    );
    await updateInstanceInfo();
  } catch (error) {
    console.error("Error updating heartbeat or instance info:", error);
  }
};

setInterval(updateHeartbeat, 1000); // 1000 ms = 1 second

const showInfoAndEnd = async (res) => {
  const visitorCount = await incrementCounter();
  const instanceIndex = process.env.INSTANCE_INDEX || "0";
  const heartbeat = await redisClient.hGet("server_heartbeats", instanceIndex);
  const lastHeartbeat = heartbeat
    ? `${Math.floor((Date.now() - parseInt(heartbeat)) / 1000)} seconds ago`
    : "N/A";

  const instanceInfo = await getInstanceInfo(instanceIndex);

  // Fetch all instance indices
  const allHeartbeats = await redisClient.hGetAll("server_heartbeats");
  const allInstanceIndices = Object.keys(allHeartbeats);

  // Fetch and aggregate instance info
  const allInstanceInfo = await Promise.all(
    allInstanceIndices.map((index) => getInstanceInfo(index)),
  );

  const aggregatedInfo = allInstanceInfo.reduce(
    (acc, info) => {
      acc.workerThreads += parseInt(info.workerThreads || 0);
      acc.memoryUsed += parseFloat(info.memoryUsed || 0);
      acc.memoryFree += parseFloat(info.memoryFree || 0);
      acc.memoryTotal += parseFloat(info.memoryTotal || 0);
      return acc;
    },
    { workerThreads: 0, memoryUsed: 0, memoryFree: 0, memoryTotal: 0 },
  );

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  res.write("<code>");
  res.write(`version: ${packageVersion()}<br />\n`);
  res.write(`Visitor count: ${visitorCount}<br />\n`);
  res.write(`Instance Index: ${instanceIndex}<br />\n`);
  res.write(`Subscribed to channel: instance:${instanceIndex}<br />\n`);
  res.write(`Last Heartbeat: ${lastHeartbeat}<br />\n`);
  res.write("<br /><h3>Instance Info:</h3>\n");

  // Display instance info in a table with swapped rows and columns
  res.write("<table border='1'>");
  res.write("<tr><th>Metric</th>");
  allInstanceIndices.forEach((index) => {
    res.write(`<th>Instance ${index}</th>`);
  });
  res.write("<th>Total</th></tr>");

  const metrics = ["workerThreads", "memoryUsed", "memoryFree", "memoryTotal"];
  const metricNames = [
    "Worker Threads",
    "Memory Used (MiB)",
    "Memory Free (MiB)",
    "Memory Total (MiB)",
  ];

  metrics.forEach((metric, i) => {
    res.write(`<tr><td>${metricNames[i]}</td>`);
    allInstanceInfo.forEach((info) => {
      res.write(`<td>${info[metric]}</td>`);
    });
    res.write(`<td>${aggregatedInfo[metric].toFixed(0)}</td></tr>`);
  });

  res.write("<tr><td>Last Update (seconds ago)</td>");
  allInstanceInfo.forEach((info) => {
    const lastUpdate = info.lastUpdate
      ? `${Math.floor((Date.now() - parseInt(info.lastUpdate)) / 1000)}`
      : "N/A";
    res.write(`<td>${lastUpdate}</td>`);
  });
  res.write("<td>N/A</td></tr>");

  res.write("</table>");

  res.write("<br />\n");
  res.write('<a href="/env">Environment</a> variables<br />\n');
  res.write("<br /><h3>Actions:</h3>\n");
  res.write(`<form action="/action" method="post">
    <input type="hidden" name="instanceIndex" value="${instanceIndex}">
    <button type="submit" name="action" value="leak">Consume Half Memory</button>
    <button type="submit" name="action" value="clear">Clear Memory</button>
    <button type="submit" name="action" value="compute">Run Compute Task</button>
  </form>`);
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
  updateInstanceInfo();
};

const clearMemory = () => {
  list.length = 0;
  updateInstanceInfo();
};

const packageVersion = () => {
  return process.env.npm_package_version;
};

const incrementCounter = async () => {
  try {
    const value = await redisClient.incr("visitor_count");
    return value;
  } catch (error) {
    console.error("Redis error:", error);
    return null;
  }
};

const showEnvironment = (res) => {
  const env = JSON.stringify(process.env, null, 2);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  res.write("<pre>");
  res.write(`${env}`);
  res.end("</pre>");
};

app.post("/action", async (req, res) => {
  const { instanceIndex, action } = req.body;
  const message = JSON.stringify({ type: action });

  try {
    await redisClient.publish(`instance:${instanceIndex}`, message);
    res.redirect("/"); // Redirect back to the main page after action
  } catch (error) {
    console.error("Error publishing action:", error);
    res.status(500).send("Error performing action");
  }

  logRequest(req);
});

app.get("/env", (req, res) => {
  text = computeIntensiveTask();
  showEnvironment(res);
  logRequest(req);
});

app.get("/", async (req, res) => {
  await showInfoAndEnd(res);
  logRequest(req);
});

app.get("/heartbeats", async (req, res) => {
  try {
    const heartbeats = await redisClient.hGetAll("server_heartbeats");
    const currentTime = Date.now();
    const formattedHeartbeats = Object.entries(heartbeats).map(
      ([instance, timestamp]) => {
        const lastBeat = parseInt(timestamp);
        const secondsAgo = Math.floor((currentTime - lastBeat) / 1000);
        return `Instance ${instance}: ${secondsAgo} seconds ago`;
      },
    );
    res.send(formattedHeartbeats.join("<br>"));
  } catch (error) {
    res.status(500).send("Error fetching heartbeats: " + error.message);
  }
  logRequest(req);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
