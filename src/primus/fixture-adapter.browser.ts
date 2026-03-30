import { SdkError } from "../errors/sdk-error.js";
import type {
  CollectPrimusAttestationInput,
  PrimusAttestationBundle,
  PrimusZkTlsAdapter
} from "./types.js";

class BrowserFixturePrimusZkTlsAdapter implements PrimusZkTlsAdapter {
  private bundlePromise: Promise<PrimusAttestationBundle> | undefined;

  constructor(private readonly bundleUrl: string) {}

  async init(): Promise<string | boolean> {
    await this.getBundle();
    return true;
  }

  async collectAttestationBundle(
    input: CollectPrimusAttestationInput
  ): Promise<PrimusAttestationBundle> {
    await input.onBeforeStartAttestation?.();
    return this.getBundle();
  }

  private async getBundle(): Promise<PrimusAttestationBundle> {
    if (!this.bundlePromise) {
      this.bundlePromise = fetchBundle(this.bundleUrl);
    }

    return this.bundlePromise;
  }
}

async function fetchBundle(bundleUrl: string): Promise<PrimusAttestationBundle> {
  const response = await fetch(bundleUrl);
  if (!response.ok) {
    throw new SdkError("Unable to fetch Primus browser fixture bundle.", "CONFIGURATION_ERROR", {
      bundleUrl,
      status: response.status
    });
  }

  return (await response.json()) as PrimusAttestationBundle;
}

export function createBrowserFixturePrimusZkTlsAdapter(bundleUrl: string): PrimusZkTlsAdapter {
  return new BrowserFixturePrimusZkTlsAdapter(bundleUrl);
}
