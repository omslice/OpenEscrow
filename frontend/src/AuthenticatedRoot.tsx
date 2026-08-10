import App from "./App";
import { AppProviders } from "./AppProviders";
import type {
  AccountLoginMethod,
  EntryContext,
} from "./lib/entryContext";

export default function AuthenticatedRoot({
  entryContext,
  initialLoginMethod,
}: {
  entryContext: EntryContext;
  initialLoginMethod?: AccountLoginMethod | null;
}) {
  return (
    <AppProviders>
      <App
        entryContext={entryContext}
        initialLoginMethod={initialLoginMethod}
      />
    </AppProviders>
  );
}
