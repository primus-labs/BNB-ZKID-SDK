import { ConfigurationError } from "../errors/sdk-error.js";
import { INTERNAL_BNB_ZKID_CONFIG } from "./internal-config.js";
import { getGlobalConfigUrl, isNodeRuntime } from "../runtime/environment.js";
import type { BnbZkIdConfigFile, LoadedBnbZkIdConfig } from "./types.js";

export async function loadBnbZkIdConfig(): Promise<LoadedBnbZkIdConfig> {
  const explicitPath =
    typeof process !== "undefined" ? process.env.BNB_ZKID_CONFIG_PATH : undefined;
  if (explicitPath) {
    return loadConfigFromFile(explicitPath);
  }

  const globalConfigUrl = getGlobalConfigUrl();
  if (!isNodeRuntime() && globalConfigUrl) {
    return loadConfigFromUrl(globalConfigUrl);
  }

  return loadEmbeddedConfig();
}

async function loadConfigFromFile(configPath: string): Promise<LoadedBnbZkIdConfig> {
  try {
    const [{ readFile }, path] = await Promise.all([
      import("node:fs/promises"),
      import("node:path")
    ]);
    const resolvedPath = path.resolve(configPath);
    const content = await readFile(resolvedPath, "utf8");
    const file = JSON.parse(content) as BnbZkIdConfigFile;
    return {
      configPath: resolvedPath,
      configDir: path.dirname(resolvedPath),
      sourceKind: "file",
      file
    };
  } catch (error) {
    throw new ConfigurationError("Unable to load bnb-zkid config file.", {
      configPath,
      cause: error instanceof Error ? error.message : String(error)
    });
  }
}

async function loadConfigFromUrl(configUrl: string): Promise<LoadedBnbZkIdConfig> {
  const response = await fetch(configUrl);
  if (!response.ok) {
    throw new ConfigurationError("Unable to fetch bnb-zkid config file.", {
      configUrl,
      status: response.status
    });
  }

  const file = (await response.json()) as BnbZkIdConfigFile;
  return {
    configPath: configUrl,
    configDir: configUrl,
    sourceKind: "url",
    file
  };
}

function loadEmbeddedConfig(): LoadedBnbZkIdConfig {
  return {
    configPath: "embedded://bnb-zkid-sdk/default-config",
    configDir: "",
    sourceKind: "embedded",
    file: INTERNAL_BNB_ZKID_CONFIG
  };
}

export async function resolveConfigResourcePath(
  loadedConfig: LoadedBnbZkIdConfig,
  relativeOrAbsolutePath: string
): Promise<string> {
  if (loadedConfig.sourceKind === "url") {
    return new URL(relativeOrAbsolutePath, loadedConfig.configPath).toString();
  }

  if (loadedConfig.sourceKind === "embedded") {
    throw new ConfigurationError("Embedded config cannot resolve external fixture resources.", {
      relativeOrAbsolutePath
    });
  }

  const path = await import("node:path");
  if (path.isAbsolute(relativeOrAbsolutePath)) {
    return relativeOrAbsolutePath;
  }

  return path.resolve(loadedConfig.configDir, relativeOrAbsolutePath);
}
