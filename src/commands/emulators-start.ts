import { Command } from "../command";
import * as controller from "../emulator/controller";
import * as commandUtils from "../emulator/commandUtils";
import * as utils from "../utils";
import * as logger from "../logger";
import { EmulatorRegistry } from "../emulator/registry";
import { DOWNLOADABLE_EMULATORS, Emulators, EMULATORS_SUPPORTED_BY_GUI } from "../emulator/types";
import * as clc from "cli-color";
import { getLogFileName } from "../emulator/downloadableEmulators";

const Table = require("cli-table");

function stylizeLink(url: String) {
  return clc.underline(clc.bold(url));
}

module.exports = new Command("emulators:start")
  .before(commandUtils.beforeEmulatorCommand)
  .description("start the local Firebase emulators")
  .option(commandUtils.FLAG_ONLY, commandUtils.DESC_ONLY)
  .option(commandUtils.FLAG_INSPECT_FUNCTIONS, commandUtils.DESC_INSPECT_FUNCTIONS)
  .option(commandUtils.FLAG_IMPORT, commandUtils.DESC_IMPORT)
  .action(async (options: any) => {
    try {
      await controller.startAll(options);
    } catch (e) {
      await controller.cleanShutdown();
      throw e;
    }

    utils.logLabeledSuccess("emulators", "All emulators started, it is now safe to connect.");

    const guiInfo = EmulatorRegistry.getInfo(Emulators.GUI);
    const guiUrl = `http://${guiInfo?.host}:${guiInfo?.port}`;
    const head = ["Emulator", "Host:Port", "Log File"];

    if (guiInfo) {
      head.push("View in GUI");
    }

    const table = new Table({
      head: head,
      style: {
        head: ["yellow"],
      },
    });

    table.push(
      ...controller
        .filterEmulatorTargets(options)
        .map((emulator) => {
          const instance = EmulatorRegistry.get(emulator);
          const info = EmulatorRegistry.getInfo(emulator);
          const emulatorName = emulator.slice(0, 1).toUpperCase() + emulator.slice(1);
          const isSupportedByGUI = EMULATORS_SUPPORTED_BY_GUI.includes(emulator);

          if (!info) {
            return [emulatorName, "Failed to initialize (see above)", "", ""];
          }

          return [
            emulatorName,
            `${info?.host}:${info?.port}`,
            DOWNLOADABLE_EMULATORS.indexOf(emulator) >= 0 ? getLogFileName(emulator) : "",
            isSupportedByGUI && guiInfo ? stylizeLink(`${guiUrl}/${emulator}`) : "",
          ];
        })
        .map((col) => col.slice(0, head.length))
        .filter((v) => v)
    );

    logger.info(`\n${table.toString()}
${
  guiInfo
    ? `\nYou can also view status and logs of the emulators by pointing your browser to ${stylizeLink(
        guiUrl
      )}/.\n`
    : ""
} 
Issues? Report them at ${stylizeLink(
      "https://github.com/firebase/firebase-tools/issues"
    )} and attach the log files.
 `);

    // Add this line above once connect page is implemented
    // It is now safe to connect your app. Instructions: http://${guiInfo?.host}:${guiInfo?.port}/connect

    // Hang until explicitly killed
    await new Promise((res, rej) => {
      process.on("SIGINT", () => {
        controller
          .cleanShutdown()
          .then(res)
          .catch(res);
      });
    });
  });
