"use strict";

function run({ mongodb, promClient, promBundle, express, pkg }) {
  const assert = require("assert");
  const process = require("process");
  const Stopwatch = require("./Stopwatch");
  const { MongoClient } = mongodb;
  const app = express();

  const metricsMiddleware = promBundle({
    includeMethod: true,
  });

  const meta = {
    runtime: "nodejs",
    driver: "mongodb",
    driverVersion: pkg.dependencies.mongodb,
    driverWithVersion: `mongodb-${pkg.dependencies.mongodb}`,
  };

  promClient.register.setDefaultLabels(meta);

  const TRUE_VALUES = ["1", "T", "t", "true", "yes"];
  const FALSE_VALUES = ["0", "F", "f", "false", "no"];
  const verbose = TRUE_VALUES.includes(process.env.VERBOSE);
  const logAsJson = !FALSE_VALUES.includes(process.env.LOG_AS_JSON);
  const logAttributes = !FALSE_VALUES.includes(process.env.LOG_ATTRIBUTES);
  const serverPort = parseInt(process.env.SERVER_PORT || "3000");
  const mongoUrl = process.argv[2] || process.env.MONGO_URL;
  const collectionName = process.env.MONGO_COLLECTION_NAME || "Samples";

  const mongoOpts = meta.driverVersion.startsWith('3.') ? {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  } : {

  };

  //----------------------------------------------------------------
  // Prometheus counters
  //----------------------------------------------------------------

  const metricsPrefix = "mongodb_client_test_";
  const connectionEventsCounter = new promClient.Counter({
    name: metricsPrefix + "connection_events_total",
    help: "counter for tracking Mongodb connection events",
    labelNames: ["eventName"],
  });
  const mongodbEventsCounter = new promClient.Counter({
    name: metricsPrefix + "driver_events_total",
    help: "counter for tracking MongoDB driver events",
    labelNames: ["eventName", "value"],
  });
  const mongodbPrimaryChangeCounter = new promClient.Counter({
    name: metricsPrefix + "primary_change_total",
    help: "counter for tracking when MongoDB's primary node changes",
    labelNames: ["nodeName"],
  });
  const executionCounter = new promClient.Counter({
    name: metricsPrefix + "tasks_total",
    help: "counter for tracking the number of executed tasks",
    labelNames: ["title", "result"],
  });
  const skippedTasksCounter = new promClient.Counter({
    name: metricsPrefix + "skipped_tasks_total",
    help: "counter for tracking the number of tasks that have been skipped while a db connection is not available",
    labelNames: ["title"],
  });
  const startedTasksCounter = new promClient.Counter({
    name: metricsPrefix + "started_tasks_total",
    help: "counter for tracking the number of tasks that have been started",
    labelNames: ["title"],
  });
  const queryHistogram = new promClient.Histogram({
    name: metricsPrefix + "task_duration",
    help: "duration of the task, in seconds",
    buckets: [0.05, 0.1, 0.5, 1, 2, 5, 10, 30, 45, 60, 90, 120],
  });
  const reconnectHistogram = new promClient.Histogram({
    name: metricsPrefix + "reconnect_duration",
    help: "duration of the reconnection to the mongo cluster, in seconds",
    buckets: [0.05, 0.1, 0.5, 1, 2, 5, 10, 30, 45, 60, 90, 120],
  });
  const timeToFirstQueryHistogram = new promClient.Histogram({
    name: metricsPrefix + "time_to_first_query_duration",
    help: "duration of the interval between a deconnection and the completion of the first task, in seconds",
    buckets: [0.05, 0.1, 0.5, 1, 2, 5, 10, 30, 45, 60, 90, 120],
  });
  const hasPrimaryNodeGauge = new promClient.Gauge({
    name: metricsPrefix + "has_primary_node",
    help: "gauge for tracking if the mongo cluster has elected a primary or not (0=No, 1=Yes)",
  });

  //----------------------------------------------------------------
  // Utils
  //----------------------------------------------------------------

  function log(...args) {
    if (logAsJson) {
      const timestamp = new Date().toISOString();
      const [msg, ...data] = args;
      const jsonData = {
        timestamp,
        msg,
      };
      if (data.length === 1) {
        jsonData.data = data[0];
      } else if (data.length > 1) {
        jsonData.data = data;
      }
      const txt = JSON.stringify(jsonData);
      console.log(txt);
    } else {
      const timestamp = new Date().toISOString();
      if (logAttributes) {
        console.log(`[${timestamp}] `, ...args);
      } else {
        console.log(`[${timestamp}] `, args[0]);
      }
    }
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function wrapHandler(handler) {
    return function() {
      handler().catch((err) => {
        log(`[ERROR] handler failed: ${err.message}`, err);
      });
    }
  }

  function getNodeName(address) {
    if (typeof address === 'string') {
      const name = address.split(":")[0];
      return name.split('.')[0];  
    }
    return 'Unknown';
  }

  //----------------------------------------------------------------
  // Context
  //----------------------------------------------------------------

  function createContext(url, opts) {
    return {
      url,
      opts,
      client: new MongoClient(url, opts),
      executionCount: 0,
      notConnectedExecutionCount: 0,
      exiting: false,
      isConnected: false,
      reconnecting: false,
      connectCount: 0,
      reconnectTimer: null,
      disconnectedWatch: null,
      disconnectedWatch2: null,
      timeToFirstQueryTimer: null,
      primaryName: null,
    };
  }

  //----------------------------------------------------------------
  // MongoDB notifications
  //----------------------------------------------------------------

  function setupMongoDriverNotifications(ctx) {
    ctx.client.on("serverDescriptionChanged", function (event) {
      const adr = getNodeName(event.address);
      mongodbEventsCounter.inc({ eventName: "serverDescriptionChanged" });
      const typeChange =
        event.previousDescription?.type !== event.newDescription?.type
          ? `${event.previousDescription?.type} --> ${event.newDescription?.type}`
          : `${event.newDescription?.type}`;
      log(`[EVENT] [serverDescriptionChanged] [${adr}] ${typeChange}`, {
        type: event.newDescription?.type,
        address: event.address,
      });
    });

    ctx.client.on("serverHeartbeatStarted", function (event) {
      const nodeName = getNodeName(event.connectionId);
      mongodbEventsCounter.inc({
        eventName: "serverHeartbeatStarted",
        value: nodeName,
      });
      // log(`[EVENT] [serverHeartbeatStarted] [${nodeName}]`, {
      //   connectionId: event.connectionId,
      // });
    });

    ctx.client.on("serverHeartbeatSucceeded", function (event) {
      const nodeName = getNodeName(event.reply.me);
      mongodbEventsCounter.inc({
        eventName: "serverHeartbeatSucceeded",
        value: nodeName,
      });
      if (verbose) {
        log(`[EVENT] [serverHeartbeatSucceeded] [${nodeName}]`, {
          connectionId: event.connectionId,
          me: event.reply.me,
          primary: event.reply.primary,
          secondary: event.reply.secondary,
        });
      }
    });

    ctx.client.on("serverHeartbeatFailed", function (event) {
      const nodeName = getNodeName(event.connectionId);
      mongodbEventsCounter.inc({
        eventName: "serverHeartbeatFailed",
        value: nodeName,
      });
      log(`[EVENT] [serverHeartbeatFailed] [${nodeName}]`, event);
    });

    ctx.client.on("serverOpening", function (event) {
      const nodeName = getNodeName(event.address);
      mongodbEventsCounter.inc({
        eventName: "serverOpening",
        value: nodeName,
      });
      log(`[EVENT] [serverOpening] [${nodeName}]`, event);
    });

    ctx.client.on("serverClosed", function (event) {
      const nodeName = getNodeName(event.address);
      mongodbEventsCounter.inc({
        eventName: "serverClosed",
        value: nodeName,
      });
      log(`[EVENT] [serverClosed] [${nodeName}]`, event);
    });

    ctx.client.on("topologyOpening", function (event) {
      mongodbEventsCounter.inc({ eventName: "topologyOpening" });
      log("[EVENT] [topologyOpening]", event);
    });

    ctx.client.on("topologyClosed", function (event) {
      mongodbEventsCounter.inc({ eventName: "topologyClosed" });
      log("[EVENT] [topologyClosed]", event);
      setConnectedState(ctx, false);
    });

    ctx.client.on("topologyDescriptionChanged", function (event) {
      mongodbEventsCounter.inc({ eventName: "topologyDescriptionChanged" });
      const typeChange =
        event.previousDescription?.type !== event.newDescription?.type
          ? `${event.previousDescription?.type} --> ${event.newDescription?.type}`
          : `${event.newDescription?.type}`;
      log(`[EVENT] [topologyDescriptionChanged] ${typeChange}`);
      if(event.newDescription?.type === 'ReplicaSetWithPrimary') {
        hasPrimaryNodeGauge.set(1);
        const newServers = [...event.newDescription.servers.values()];
        const newPrimary = newServers.find(x => x.type === 'RSPrimary')?.me;
        if (newPrimary && newPrimary !== ctx.primaryName) {
          const oldPrimaryName = ctx.primaryName;
          ctx.primaryName = newPrimary;
          mongodbPrimaryChangeCounter.inc({ nodeName: getNodeName(ctx.primaryName) });
          log(`[INFO] new primary is ${getNodeName(newPrimary)} (Old was ${getNodeName(oldPrimaryName)})`);
        }
      } else if (event.newDescription?.type === 'ReplicaSetNoPrimary') {
        hasPrimaryNodeGauge.set(0);
      }
      if (event.newDescription?.type === "ReplicaSetWithPrimary") {
        setConnectedState(ctx, true);
      } else if (event.newDescription?.type === "ReplicaSetNoPrimary") {
        setConnectedState(ctx, false);
      }
    });
  }

  function setConnectedState(ctx, value) {
    if (value != ctx.isConnected) {
      ctx.isConnected = value;
      if (value) {
        ctx.connectCount++;
        connectionEventsCounter.inc({ eventName: "connected" });
        log("[INFO] Connected to MongoDB server");
        if (ctx.connectCount > 1) {
          connectionEventsCounter.inc({ eventName: "reconnected" });
          let elapsedTimeInMS = 0;
          if (ctx.disconnectedWatch) {
            elapsedTimeInMS = ctx.disconnectedWatch.elapsedTimeInMS();
            ctx.disconnectedWatch = undefined;
          }
          log(`[INFO] Reconnecting to MongoDB server, after ${elapsedTimeInMS} ms`, {
            elapsedTime: elapsedTimeInMS,
          });
          if (ctx.reconnectTimer) {
            ctx.reconnectTimer();
            ctx.reconnectTimer = undefined;
          }
        }
      } else {
        connectionEventsCounter.inc({ eventName: "disconnected" });
        if (!ctx.reconnectTimer) {
          ctx.reconnectTimer = reconnectHistogram.startTimer();
        }
        if (!ctx.disconnectedWatch) {
          ctx.disconnectedWatch = Stopwatch.startNew();
        }
        if (!ctx.disconnectedWatch2) {
          ctx.disconnectedWatch2 = Stopwatch.startNew();
        }
        if (!ctx.timeToFirstQueryTimer) {
          ctx.timeToFirstQueryTimer = timeToFirstQueryHistogram.startTimer();
        }
        log("[INFO] Disconnected from MongoDB server");
      }
    }
  }

  //----------------------------------------------------------------
  // process events
  //----------------------------------------------------------------

  async function shutdown(ctx, code = 0) {
    if (ctx.exiting || !ctx.client) {
      return;
    }
    ctx.exiting = true;
    log("[INFO] Shutdown initiated");
    log("[SHUTDOWN] Draining active requests...");
    await delay(600);
    try {
      log("[SHUTDOWN] Disconnecting from DB...");
      await ctx.client.close();
      log("[SHUTDOWN] Disconnected from DB");
    } catch (err) {
      log(`[ERROR] [SHUTDOWN] Disconnection failed: ${err.message}`, err);
    } finally {
      process.exit(code);
    }
  }

  async function startup(ctx) {
    const name = ctx.url.split("@")[1].split("?")[0];
    log(`[STARTUP] Connecting to MongoDB ${name}`, { opts: ctx.opts });
    setupMongoDriverNotifications(ctx);
    await ctx.client.connect();
    log(`[STARTUP] Connected to MongoDB ${name}`);

    // Make sure that we have a Samples collection and a few documents to fetch
    const docs = await ctx.client
      .db()
      .collection(collectionName)
      .find()
      .limit(5)
      .toArray();
    if (docs.length === 0) {
      log(`[WARN] The '${collectionName}' does not exist. Let's create a few documents.`)
      for (let i = 0; i < 5; i++) {
        ctx.client.db().collection(collectionName).insertOne({
          name: `Sample-${i}`,
          createdAt: new Date().toISOString(),
        })
      }
    }
  }

  async function tryReconnect(ctx) {
    if (ctx.reconnecting || !ctx.client) {
      return;
    }
    ctx.reconnecting = true;
    try {
      log(
        `[WARN] MongoDB had a server selection error and is still disconnected after 5s. We're closing the connection to force a full reconnect.`
      );
      connectionEventsCounter.inc({ eventName: "forcedReconnection" });

      try {
        await ctx.client.close(true);
      } catch (err) {
        log(
          `[WARN] Error while trying to disconnect MongoDB client: ${err.message}`,
          err
        );
        return;
      }
      log("[INFO] MongoDB client was successfully disconnected");
      ctx.client = new MongoClient(ctx.url, ctx.opts);
      setupMongoDriverNotifications(ctx);
      try {
        await ctx.client.connect();
        log("[INFO] MongoDB client was successfully reconnected");
      } catch (err) {
        log(
          `[WARN] Error while MongoDB client tried to reconnect: ${err.message}`,
          err
        );
      }
    } finally {
      ctx.reconnecting = false;
    }
  }

  function setupHandler(signal, handle) {
    log(`[INFO] Registering signal handler for ${signal}`);
    process.on(signal, handle);
  }

  //----------------------------------------------------------------
  // Task executor
  //----------------------------------------------------------------

  async function execute(ctx, title, task) {
    if (ctx.exiting) {
      return;
    }
    ctx.executionCount++;
    const executionCount = ctx.executionCount;
    const taskLogPrefix = `[TASK] [${executionCount}] [${title}]`;
    if (ctx.reconnecting) {
      skippedTasksCounter.inc({ title });
      log(`[WARN] ${taskLogPrefix} Execution is suspended while forcing a reconnect`);
      return;
    }
    if (!ctx.isConnected && ctx.notConnectedExecutionCount > 120) {
      ctx.notConnectedExecutionCount++;
      skippedTasksCounter.inc({ title });
      log(`[WARN] ${taskLogPrefix} Execution is suspended because there are too many pending tasks`);
      return;
    }
    try {
      if (!ctx.isConnected) {
        ctx.notConnectedExecutionCount++;
        log(`${taskLogPrefix} Start execution while MongoDB is not connected`);
      } else if (ctx.notConnectedExecutionCount > 0) {
        log(
          `${taskLogPrefix} Issued ${ctx.notConnectedExecutionCount} tasks while MongoDB was not connected`
        );
        ctx.notConnectedExecutionCount = 0;
      }
      startedTasksCounter.inc({ title });
      const watch = Stopwatch.startNew();
      const isConnected = ctx.isConnected;
      // const end = queryHistogram.startTimer();
      let docs;
      try {
        docs = await task(ctx);
      } finally {
        // end();
        watch.stop();
      }
      executionCounter.inc({ title, result: 'success' });
      if (ctx.timeToFirstQueryTimer) {
        ctx.timeToFirstQueryTimer();
        ctx.timeToFirstQueryTimer = undefined;
      }
      const elapsedTimeInMS = watch.elapsedTimeInMS();
      queryHistogram.observe(elapsedTimeInMS/1000.0)
      const attributes = [];
      if (elapsedTimeInMS > 100) {
        attributes.push("slow task");
      }
      if (!isConnected) {
        attributes.push("was disconnected");
      }
      const nbDocs = Array.isArray(docs) ? docs.length : 0;
      if (attributes.length > 0) {
        log(
          `${taskLogPrefix} Elapsed time: ${elapsedTimeInMS} ms (${attributes.join(
            ", "
          )}) for ${nbDocs} docs`,
          { elapsedTime: elapsedTimeInMS }
        );
      } else {
        if (verbose && executionCount % 10 === 0) {
          if (nbDocs > 0) {
            log(`${taskLogPrefix} returned ${nbDocs} documents`, { sample: docs[0] });
          } else {
            log(`${taskLogPrefix} no document was returned`);
          }
        }
      }
      if (ctx.disconnectedWatch2) {
        log(
          `${taskLogPrefix} First time to execute after disconnection: ${ctx.disconnectedWatch2.elapsedTimeInMS()} ms`
        ),
          { elapsedTime: ctx.disconnectedWatch2.elapsedTimeInMS() };
        ctx.disconnectedWatch2 = undefined;
      }
    } catch (err) {
      executionCounter.inc({ title, result: 'failure' });
      log(`[ERROR] ${taskLogPrefix} execution failed: ${err.message}`, err);
      if (
        err.message.startsWith("Server selection timed out after ") ||
        err.message.startsWith("not primary and secondaryOk=false")
      ) {
        setTimeout(() => {
          if (ctx.isConnected) {
            log("[WARN] MongoDB had a server selection error but is now connected");
          } else {
            tryReconnect(ctx).catch((err) => log(err));
          }
        }, 5000);
      }
    }
  }

  //----------------------------------------------------------------
  // Tasks
  //----------------------------------------------------------------

  function queryTask(ctx) {
    const limit = 5;
    return execute(ctx, `Get documents`, async (ctx) => {
      return await ctx.client
        .db()
        .collection(collectionName)
        .find()
        .limit(limit)
        .toArray();
    });
  }

  //----------------------------------------------------------------
  // main func
  //----------------------------------------------------------------

  async function main(url, opts) {
    log(
      `[INFO] MongoDB client using runtime ${meta.runtime} and driver ${meta.driver} ${meta.driverVersion}`
    );
    assert.ok(url, "MongoDB URL not provided as argument");

    const ctx = createContext(url, opts);

    process.on("unhandledRejection", (err) => {
      log(`[WARN] Uhandled Rejection:`, err);
      shutdown(ctx, 1);
    });

    await startup(ctx);

    setupHandler("SIGHUP", () => shutdown(ctx));
    setupHandler("SIGINT", () => shutdown(ctx));
    setupHandler("SIGTERM", () => shutdown(ctx));

    setInterval(wrapHandler(() => queryTask(ctx)), 500);
    // setTimeout(wrapHandler(() => tryReconnect(ctx)), 10000);
  }

  function startWebServer() {
    app.use(metricsMiddleware);
    app.use((req, res) => {
      res.status(200).send("OK");
    });
    app.listen(serverPort, () => {
      log(`[INFO] Listening on port ${serverPort}...`);
    });
  }

  if (mongoUrl) {
    main(mongoUrl, mongoOpts).then(startWebServer).catch(err => {
      log(`[ERROR] Could not start mongo-client. Error: ${err.message}`, err);
    });
  } else {
    console.log('');
    console.log(`usage: node index.js [Connection String | env.MONGO_URL]`);
  }
}

module.exports = run;
