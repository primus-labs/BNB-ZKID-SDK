import { readFile } from "node:fs/promises";
import path from "node:path";
import { SdkError } from "../errors/sdk-error.js";
import type {
  CollectPrimusAttestationInput,
  PrimusAttestationBundle,
  PrimusZkTlsAdapter
} from "./types.js";

class FixturePrimusZkTlsAdapter implements PrimusZkTlsAdapter {
  private bundlePromise: Promise<PrimusAttestationBundle> | undefined;

  constructor(private readonly bundlePath: string) {}

  async init(): Promise<string | boolean> {
    await this.getBundle();
    return true;
  }

  async collectAttestationBundle(
    input: CollectPrimusAttestationInput
  ): Promise<PrimusAttestationBundle> {
    void input;
    return this.getBundle();
  }

  private async getBundle(): Promise<PrimusAttestationBundle> {
    if (!this.bundlePromise) {
      this.bundlePromise = readJsonBundle(this.bundlePath);
    }

    return this.bundlePromise;
  }
}

async function readJsonBundle(bundlePath: string): Promise<PrimusAttestationBundle> {
  try {
    const content = await readFile(bundlePath, "utf8");
    return JSON.parse(content) as PrimusAttestationBundle;
  } catch (error) {
    throw new SdkError("Unable to load Primus fixture bundle.", "CONFIGURATION_ERROR", {
      bundlePath,
      cause: error instanceof Error ? error.message : String(error)
    });
  }
}

export function createFixturePrimusZkTlsAdapter(bundlePath: string): PrimusZkTlsAdapter {
  return new FixturePrimusZkTlsAdapter(path.resolve(bundlePath));
}
