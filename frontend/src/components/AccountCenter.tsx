import { lazy, Suspense } from "react";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";
import type { ServiceReadiness } from "../lib/negotiations";

const PrivyAccountCenter = lazy(() =>
  import("./PrivyAccountCenter").then((module) => ({ default: module.PrivyAccountCenter })),
);

export function AccountCenter({
  workspaceRole,
  onChangeWorkspaceRole,
  onReadinessChange,
}: {
  workspaceRole?: string;
  onChangeWorkspaceRole?: () => void;
  onReadinessChange?: (serviceReadiness: ServiceReadiness | null) => void;
}) {
  if (!ACCOUNT_AUTH_ENABLED) return null;
  return (
    <Suspense fallback={null}>
      <PrivyAccountCenter
        workspaceRole={workspaceRole}
        onChangeWorkspaceRole={onChangeWorkspaceRole}
        onReadinessChange={onReadinessChange}
      />
    </Suspense>
  );
}
