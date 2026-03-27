import type { PrimusAttCondition, PrimusAdditionParams, PrimusAttConditions } from "../primus/types.js";

export const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export const LISTDAO_GITHUB_TEMPLATEID = "21701f5e-c90c-40a4-8ced-bc1696828f11";
export const LISTDAO_STEAM_ORDERHISTORY_TEMPLATEID = "2de562e4-d1b0-49c2-8cff-2fd229818392";
export const LISTDAO_AMAZON_PRIMPRIME_TEMPLATEID = "9119207f-5884-403d-8bb3-1b6870d428fe";
export const LISTDAO_BINANCE_ASSETSHISTORY_TEMPLATEID = "ccb898b0-e4b2-4859-95ae-9b41159e8b59";
export const LISTDAO_OKX_ORDERHISTORY_TEMPLATEID = "94a219ee-27f9-4e65-9ff3-de1197a780dc";

export interface ListdaoPrimusTemplateOptions {
  attConditions?: PrimusAttConditions;
  additionParams?: PrimusAdditionParams;
  allJsonResponseFlag?: "true" | "false";
}


const SHA256_WITH_SALT = "SHA256_WITH_SALT" as const;

function saltFields(...fields: string[]): PrimusAttCondition[] {
  return fields.map((field) => ({ field, op: SHA256_WITH_SALT }));
}

function saltGroups(...groups: string[][]): PrimusAttConditions {
  return groups.map((g) => saltFields(...g));
}

type ListdaoOptionsEntry = ListdaoPrimusTemplateOptions | (() => ListdaoPrimusTemplateOptions);

/** Templates keyed by full template UUID; values are static options or a factory (time-sensitive params). */
const LISTDAO_TEMPLATE_OPTIONS: Record<string, ListdaoOptionsEntry> = {
  [LISTDAO_GITHUB_TEMPLATEID]: {
    attConditions: saltGroups(["github_id"], ["contribution", "years", "github_id_in_html"]),
    allJsonResponseFlag: "true"
  },
  [LISTDAO_STEAM_ORDERHISTORY_TEMPLATEID]: {
    attConditions: saltGroups(["purchase_history", "profile_info"]),
    allJsonResponseFlag: "true"
  },
  [LISTDAO_AMAZON_PRIMPRIME_TEMPLATEID]: {
    attConditions: saltGroups(
      ["email"],
      ["years", "prime_plan", "last_3_months_orders"],
      ["year_2025_orders"]
    ),
    allJsonResponseFlag: "true"
  },
  [LISTDAO_BINANCE_ASSETSHISTORY_TEMPLATEID]: () => {
    const now = Date.now();
    return {
      additionParams: {
        needUpdateRequests: [
          {
            bodyParams: {
              startTime: now - MONTH_MS * 6,
              endTime: now,
              rows: 100
            }
          }
        ]
      },
      attConditions: saltGroups(["data"], ["userId", "passKycLevel"]),
      allJsonResponseFlag: "true"
    };
  },
  [LISTDAO_OKX_ORDERHISTORY_TEMPLATEID]: () => {
    const now = Date.now();
    return {
      additionParams: {
        needUpdateRequests: [
          {
            queryParams: {
              _start: now - MONTH_MS * 6,
              _end: now,
              limit: 100,
              t: now
            }
          }
        ]
      },
      attConditions: saltGroups(["data"], ["uuid", "kycLevel"]),
      allJsonResponseFlag: "true"
    };
  }
};

/**
 * Primus attestation options for ListDAO / dev-console templates (same rules as Template ItemDetail).
 */
export function getListdaoTemplateAttOptions(templateId: string): ListdaoPrimusTemplateOptions | undefined {
  const entry = LISTDAO_TEMPLATE_OPTIONS[templateId];
  if (entry === undefined) {
    return undefined;
  }
  return typeof entry === "function" ? entry() : entry;
}

/** Apply ListDAO template options to a Primus attestation request builder (e.g. dev-console tooling). */
export function applyListdaoTemplateOptions(
  attRequest: {
    setAttConditions: (v: unknown) => void;
    setAllJsonResponseFlag: (v: string) => void;
    setAdditionParams: (v: string) => void;
  },
  templateId: string
): void {
  const opts = getListdaoTemplateAttOptions(templateId);
  if (!opts) {
    return;
  }

  if (opts.attConditions?.length) {
    attRequest.setAttConditions(opts.attConditions);
  }
  if (opts.additionParams && Object.keys(opts.additionParams).length > 0) {
    attRequest.setAdditionParams(JSON.stringify(opts.additionParams));
  }
  if (opts.allJsonResponseFlag !== undefined) {
    attRequest.setAllJsonResponseFlag(opts.allJsonResponseFlag);
  }
}
