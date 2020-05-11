import clc = require("cli-color");
const superstatic = require("superstatic").server; // Superstatic has no types, requires odd importing.
const morgan = require("morgan");

import { detectProjectRoot } from "../detectProjectRoot";
import { FirebaseError } from "../error";
import { implicitInit, TemplateServerResponse } from "../hosting/implicitInit";
import { initMiddleware } from "../hosting/initMiddleware";
import { normalizedHostingConfigs } from "../hosting/normalizedHostingConfigs";
import * as utils from "../utils";
import cloudRunProxy from "../hosting/cloudRunProxy";
import functionsProxy from "../hosting/functionsProxy";
import { NextFunction, Request, Response } from "express";
import { Writable } from "stream";

const MAX_PORT_ATTEMPTS = 10;
let attempts = 0;
let server: any; // eslint-disable-line @typescript-eslint/no-explicit-any

const logData = {
  metadata: {
    emulator: {
      name: "hosting",
    },
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function startServer(options: any, config: any, port: number, init: TemplateServerResponse): void {
  const firebaseMiddleware = initMiddleware(init);

  const morganStream = new Writable();
  morganStream._write = (
    chunk: any,
    encoding: string,
    callback: (error?: Error | null) => void
  ) => {
    if (chunk instanceof Buffer) {
      utils.logLabeledBullet("hosting", chunk.toString().trim(), "info", logData);
    }

    callback();
  };

  const morganMiddleware = morgan("combined", {
    stream: morganStream,
  });

  server = superstatic({
    debug: false,
    port: port,
    host: options.host,
    config: config,
    cwd: detectProjectRoot(options.cwd),
    stack: "strict",
    before: {
      middleware: (req: Request, res: Response, next: NextFunction) => {
        // We do these in a single method to ensure order of operations
        morganMiddleware(req, res, () => {
          /*
          NoOp next function
        */
        });
        firebaseMiddleware(req, res, next);
      },
    },
    rewriters: {
      function: functionsProxy(options),
      run: cloudRunProxy(options),
    },
  }).listen(() => {
    const siteName = config.target || config.site;
    const label = siteName ? "hosting[" + siteName + "]" : "hosting";

    if (config.public && config.public !== ".") {
      utils.logLabeledBullet(
        label,
        "Serving hosting files from: " + clc.bold(config.public),
        "info",
        logData
      );
    }
    utils.logLabeledSuccess(
      label,
      "Local server: " + clc.underline(clc.bold("http://" + options.host + ":" + port)),
      "info",
      logData
    );
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      const message = "Port " + options.port + " is not available.";
      if (attempts < MAX_PORT_ATTEMPTS) {
        utils.logWarning(
          clc.yellow("hosting: ") + message + " Trying another port...",
          "warn",
          logData
        );
        // Another project that's running takes up to 4 ports: 1 hosting port and 3 functions ports
        attempts++;
        startServer(options, config, port + 5, init);
      } else {
        utils.logWarning(message);
        throw new FirebaseError("Could not find an open port for hosting development server.", {
          exit: 1,
        });
      }
    } else {
      throw new FirebaseError(
        "An error occurred while starting the hosting development server:\n\n" + err.toString(),
        { exit: 1 }
      );
    }
  });
}

/**
 * Stop the Hosting server.
 */
export async function stop(): Promise<void> {
  if (server) {
    await server.close();
  }
}

/**
 * Start the Hosting server.
 * @param options the Firebase CLI options.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function start(options: any): Promise<void> {
  const init = await implicitInit(options);
  const configs = normalizedHostingConfigs(options);

  for (let i = 0; i < configs.length; i++) {
    // skip over the functions emulator ports to avoid breaking changes
    const port = i === 0 ? options.port : options.port + 4 + i;
    startServer(options, configs[i], port, init);
  }
}

/**
 * Connect the Hosting server.
 */
export async function connect(): Promise<void> {
  await Promise.resolve();
}
