import { AutodartsToolsConfig, defaultConfig } from "@/utils/storage";

export async function migrationConfig() {
  const config = await AutodartsToolsConfig.getValue();
  if (!config) return;

  const currentConfigVersion = config.version;
  await migrateConfig(currentConfigVersion).catch(console.error);
}

async function migrateConfig(currentConfigVersion: number) {
  console.log("Autodarts Tools: Migrating config...");

  const config = await AutodartsToolsConfig.getValue();

  while (currentConfigVersion < defaultConfig.version) {
    switch (currentConfigVersion) {
      case 1:
        // Migration from version 1 to version 2
        config.version = 2;
        if (!config.friendsList) {
          config.friendsList = {
            ...defaultConfig.friendsList,
          };
        }
        break;
      case 2:
        // Migration from version 2 to version 3
        config.version = 3;
        if (!config.zoom || !config.zoom.position) {
          config.zoom = {
            ...defaultConfig.zoom,
          };
        }
        break;
      case 3:
        // Migration from version 3 to version 4
        config.version = 4;
        if (!config.quickCorrection) {
          config.quickCorrection = {
            ...defaultConfig.quickCorrection,
          };
        }
        break;
      case 4:
        // Migration from version 4 to version 5
        config.version = 5;
        if (config.zoom && !config.zoom.zoomOn) {
          config.zoom.zoomOn = "everyone";
        }
        break;
    }

    await AutodartsToolsConfig.setValue(config);
    currentConfigVersion++;
  }

  console.log("Autodarts Tools: Migration config done");
}
