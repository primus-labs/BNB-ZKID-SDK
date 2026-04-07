import { ConfigurationError } from "../errors/sdk-error.js";
import { INTERNAL_BNB_ZKID_CONFIG } from "./internal-config.js";
import { getGlobalConfigUrl, isNodeRuntime } from "../runtime/environment.js";
import type {
  BnbZkIdConfigFile,
  BnbZkIdConfigOverrideFile,
  LoadedBnbZkIdConfig
} from "./types.js";

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
      importRuntimeModule<typeof import("node:fs/promises")>("node:fs/promises"),
      importRuntimeModule<typeof import("node:path")>("node:path")
    ]);
    const resolvedPath = path.resolve(configPath);
    const content = await readFile(resolvedPath, "utf8");
    const override = JSON.parse(content) as BnbZkIdConfigOverrideFile;
    return {
      configPath: resolvedPath,
      configDir: path.dirname(resolvedPath),
      sourceKind: "file",
      file: mergeBnbZkIdConfig(override)
    };
  } catch (error) {
    throw new ConfigurationError("Unable to load bnb-zkid config file.", {
      configPath,
      cause: error instanceof Error ? error.message : String(error)
    });
  }
}

async function loadConfigFromUrl(configUrl: string): Promise<LoadedBnbZkIdConfig> {
  const resolvedConfigUrl = new URL(configUrl, globalThis.location?.href).toString();
  const response = await fetch(resolvedConfigUrl);
  if (!response.ok) {
    throw new ConfigurationError("Unable to fetch bnb-zkid config file.", {
      configUrl: resolvedConfigUrl,
      status: response.status
    });
  }

  const override = (await response.json()) as BnbZkIdConfigOverrideFile;
  return {
    configPath: response.url || resolvedConfigUrl,
    configDir: response.url || resolvedConfigUrl,
    sourceKind: "url",
    file: mergeBnbZkIdConfig(override)
  };
}

function loadEmbeddedConfig(): LoadedBnbZkIdConfig {
  return {
    configPath: "embedded://bnb-zkid-sdk/default-config",
    configDir: "",
    sourceKind: "embedded",
    file: mergeBnbZkIdConfig()
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

  const path = await importRuntimeModule<typeof import("node:path")>("node:path");
  if (path.isAbsolute(relativeOrAbsolutePath)) {
    return relativeOrAbsolutePath;
  }

  return path.resolve(loadedConfig.configDir, relativeOrAbsolutePath);
}

async function importRuntimeModule<T>(specifier: string): Promise<T> {
  return (import(
    /* @vite-ignore */
    specifier
  ) as unknown) as Promise<T>;
}

function mergeBnbZkIdConfig(override?: BnbZkIdConfigOverrideFile): BnbZkIdConfigFile {
  return {
    gateway: mergeConfigValue(
      INTERNAL_BNB_ZKID_CONFIG.gateway,
      override?.gateway
    ) as BnbZkIdConfigFile["gateway"],
    primus: mergeConfigValue(
      INTERNAL_BNB_ZKID_CONFIG.primus,
      override?.primus
    ) as BnbZkIdConfigFile["primus"]
  };
}

function mergeConfigValue<T>(baseValue: T, overrideValue?: unknown): T {
  if (overrideValue === undefined) {
    return cloneConfigValue(baseValue);
  }

  if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
    const baseRecord = baseValue as Record<string, unknown>;
    const merged: Record<string, unknown> = {};
    const keys = new Set([
      ...Object.keys(baseRecord),
      ...Object.keys(overrideValue)
    ]);

    for (const key of keys) {
      const baseEntry = baseRecord[key];
      const hasOverride = Object.prototype.hasOwnProperty.call(overrideValue, key);
      if (!hasOverride) {
        merged[key] = cloneConfigValue(baseEntry);
        continue;
      }

      const overrideEntry = overrideValue[key];
      if (baseEntry !== undefined) {
        merged[key] = mergeConfigValue(baseEntry, overrideEntry);
      } else {
        merged[key] = cloneConfigValue(overrideEntry);
      }
    }

    return merged as T;
  }

  return cloneConfigValue(overrideValue as T);
}

function cloneConfigValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    if (Array.isArray(value)) {
      return value.map((item) => cloneConfigValue(item)) as T;
    }
    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, cloneConfigValue(entry)])
      ) as T;
    }
    return value;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
