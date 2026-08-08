import { US_JURISDICTION_PROFILES } from "./us-jurisdiction-profiles.js";
import {
  FEDERAL_COMPLIANCE_OVERLAYS,
  LOCAL_COMPLIANCE_OVERLAYS,
} from "./us-compliance-overlays.js";

const sources = [
  ...US_JURISDICTION_PROFILES.map((profile) => ({
    key: `state:${profile.postalCode.toLowerCase()}`,
    scope: "state",
    jurisdiction: profile.code,
    version: profile.version,
    citation: profile.statuteCitation,
    url: profile.statuteUrl,
    monitoringException: profile.sourceMonitoringException || null,
  })),
  ...[...FEDERAL_COMPLIANCE_OVERLAYS, ...LOCAL_COMPLIANCE_OVERLAYS].flatMap((overlay) =>
    overlay.sources.map((item, index) => ({
      key: `overlay:${overlay.id}:${index + 1}`,
      scope: overlay.scope,
      jurisdiction: overlay.id,
      version: overlay.version,
      citation: item.citation,
      url: item.url,
      monitoringException: null,
    })),
  ),
];

export const COMPLIANCE_SOURCE_REGISTRY = Object.freeze(
  sources.map((item) => Object.freeze(item)),
);
