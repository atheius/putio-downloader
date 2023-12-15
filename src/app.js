const path = require("path");
const AutoLoad = require("@fastify/autoload")
const Env = require("@fastify/env");
const S = require("fluent-json-schema");
const schedule = require("node-schedule");
const filebot = require("./plugins/filebot");
const putio = require("./plugins/putio");
const processor = require("./plugins/processor");
const queue = require("./plugins/queue");

module.exports = async function (fastify, opts) {
  // Get environment config
  await fastify.register(Env, {
    schema: S.object()
      .prop("NODE_ENV", S.string().required().default("production"))
      .prop("ACCESS_TOKEN", S.string().required().default(""))
      .prop("DOWNLOAD_DIR", S.string().required().default("./tmp"))
      .prop("FILEBOT_ENABLED", S.boolean().required().default(true))
      .prop(
        "FILEBOT_NODE_URL",
        S.string().required().default("http://filebot-node:5452")
      )
      .valueOf(),
  });

  // Register plugins
  fastify.register(require("@fastify/sensible"), {
    errorHandler: false,
  });
  fastify.register(require("fastify-healthcheck"));
  fastify.register(require("@fastify/formbody"));

  // Register custom plugins (need to be loaded in order)
  await fastify.register(filebot);
  await fastify.register(putio, { accessToken: fastify.config.ACCESS_TOKEN });
  await fastify.register(processor, {
    downloadDir: fastify.config.DOWNLOAD_DIR,
    filebotEnabled: fastify.config.FILEBOT_ENABLED,
  });
  await fastify.register(queue);

  // Define routes
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, "routes"),
    options: Object.assign({}, opts),
  });

  // Schedule a job to run every day (in case Put.io callbacks are missed)
  schedule.scheduleJob("0 6 * * *", async () => {
    fastify.log.info("Starting download files job");
    const { files } = await fastify.putio.getFiles();
    for (const file of files) {
      fastify.queue(file.id);
    }
  });
};
