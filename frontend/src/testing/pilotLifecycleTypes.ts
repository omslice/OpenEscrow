import type {
  CreatedNegotiation,
  NegotiationAccess,
  NegotiationRecord,
} from "../lib/negotiations";

export type PilotLifecycleRole =
  | "landlord"
  | "tenant-one"
  | "tenant-two"
  | "arbiter";

export type PilotLifecycleStage =
  | "funded"
  | "claim-open"
  | "disputed"
  | "closed";

export type PilotLifecycleBootstrap = {
  role: PilotLifecycleRole;
  stage: PilotLifecycleStage;
  access: NegotiationAccess;
  record: NegotiationRecord;
  landlordBundle?: CreatedNegotiation;
  responseCount: number;
  viewerResponded: boolean;
  claimAmountMicros: string;
  disputedMicros: string;
  landlordWithdrawableMicros: string;
  tenantWithdrawableMicros: string;
  withdrawnRoles: PilotLifecycleRole[];
};

declare global {
  interface Window {
    __OPENESCROW_PILOT_LIFECYCLE__?: PilotLifecycleBootstrap;
  }
}
