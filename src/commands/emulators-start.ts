import { Command } from "../command";
import * as controller from "../emulator/controller";
import * as commandUtils from "../emulator/commandUtils";
import * as utils from "../utils";
import { FirebaseError } from "../error";

module.exports = new Command("emulators:start")
  .before(commandUtils.beforeEmulatorCommand)
  .description("start the local Firebase emulators")
  .option(commandUtils.FLAG_ONLY, commandUtils.DESC_ONLY)
  .option(commandUtils.FLAG_INSPECT_FUNCTIONS, commandUtils.DESC_INSPECT_FUNCTIONS)
  .option(commandUtils.FLAG_IMPORT, commandUtils.DESC_IMPORT)
  .action(async (options: any) => {
    const killSignalPromise = commandUtils.shutdownWhenKilled();

    try {
      await controller.startAll(options);
    } catch (e) {
      await controller.cleanShutdown();
      throw e;
    }

    utils.logLabeledSuccess("emulators", "All emulators started, it is now safe to connect.");

    // Hang until explicitly killed
    await killSignalPromise;
  });
