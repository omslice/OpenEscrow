import { lazy, Suspense } from "react";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";

const PrivyAccountCenter = lazy(() =>
  import("./PrivyAccountCenter").then((module) => ({ default: module.PrivyAccountCenter })),
);

export function AccountCenter({
  embedded = false,
  workspaceRole,
  onChangeWorkspaceRole,
}: {
  embedded?: boolean;
  workspaceRole?: string;
  onChangeWorkspaceRole?: () => void;
}) {
  if (!ACCOUNT_AUTH_ENABLED) return null;
  return (
    <Suspense fallback={null}>
      <PrivyAccountCenter
        embedded={embedded}
        workspaceRole={workspaceRole}
        onChangeWorkspaceRole={onChangeWorkspaceRole}
      />
    </Suspense>
  );
}
