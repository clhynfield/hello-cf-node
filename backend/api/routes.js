const express = require("express");
const { cpuUsage, memoryUsage } = require("node:process");
const { Worker } = require("worker_threads");
const {
  initCache,
  cacheSet,
  cacheGetAll,
  incr,
  publish,
} = require("../instanceInfoCache");

const list = [];
const workers = [];

const router = express.Router();

function handleMessage(message, channel) {
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
      console.error(`Unknown instruction type: ${instruction.type}`);
  }
}

initCache(handleMessage).catch(console.error);

async function updateInstanceInfo() {
  const instanceIndex = process.env.INSTANCE_INDEX || "0";
  const info = {
    workerThreads: workers.length,
    memoryUsed: (memoryUsedBytes() / 1024 / 1024).toFixed(2),
    memoryFree: (memoryFreeBytes() / 1024 / 1024).toFixed(2),
    memoryTotal: (memoryLimitBytes() / 1024 / 1024).toFixed(2),
    lastUpdate: Date.now().toString(),
  };
  console.log(
    `Saving to cache key instance:${instanceIndex}:info ${JSON.stringify(info)}`,
  );
  await cacheSet(`instance:${instanceIndex}:info`, info);
}

async function getInstanceInfo(instanceIndex) {
  return await cacheGetAll(`instance:${instanceIndex}:info`);
}

const updateHeartbeat = async () => {
  const instanceIndex = process.env.INSTANCE_INDEX || "0";
  const timestamp = Date.now();
  try {
    // await cacheSet(`instance:${instanceIndex}:heartbeat`, timestamp.toString());
    await updateInstanceInfo();
  } catch (error) {
    console.error("Error updating heartbeat or instance info:", error);
  }
};

setInterval(updateHeartbeat, 1000); // 1000 ms = 1 second

const computeIntensiveTask = (n) => {
  const worker = new Worker("./backend/compute.js", { workerData: 46 });
  workers.push(worker);
  let text = "";
  worker.on("message", (result) => {
    text = result;
    workers.pop();
  });
  updateInstanceInfo();
  return text;
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

const incrementCounter = async () => {
  try {
    const value = await incr("visitor_count");
    return value;
  } catch (error) {
    console.error("Redis error:", error);
    return null;
  }
};

const logRequest = (req) => {
  console.log(`Served a request for ${req.url}`);
};

router.get("/info", async (req, res) => {
  try {
    const visitorCount = await incr("visitor_count");
    const instanceIndex = process.env.INSTANCE_INDEX || "0";
    let info = await getInstanceInfo(instanceIndex);
    info.version = process.env.npm_package_version;
    info.visitorCount = visitorCount;
    info.instanceIndex = instanceIndex;
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
    console.log("Error getting instance info:", error);
  }
});

router.post("/action", async (req, res) => {
  const { instanceIndex, action } = req.body;
  const message = JSON.stringify({ type: action });

  logRequest(req);
  try {
    await publish(`instance:${instanceIndex}`, message);
  } catch (error) {
    console.error("Error publishing action:", error);
    // res.status(500).send("Error performing action");
  }

  res.json({ message: `Action ${action} performed` });
});

module.exports = router;
