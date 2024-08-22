const redis = require("redis");
const { memoryUsage } = require("node:process");

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

async function initCache(handleMessage) {
  await redisClient.connect();
  await redisSubscriber.connect();
  console.log("Redis connected.");

  const instanceIndex = process.env.INSTANCE_INDEX || "0";
  await redisSubscriber.subscribe(`instance:${instanceIndex}`, handleMessage);
}

const cacheSet = async (key, value) => {
  await redisClient.hSet(key, value);
};

const cacheGetAll = async (key) => {
  const info = await redisClient.hGetAll(key);
  return info;
};

const incr = async (key) => {
  return await redisClient.incr(key);
};

const publish = async (channel, message) => {
  await redisClient.publish(channel, message);
};

module.exports = {
  initCache,
  cacheSet,
  cacheGetAll,
  incr,
  publish,
};
