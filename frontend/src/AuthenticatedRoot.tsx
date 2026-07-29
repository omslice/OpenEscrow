import App from "./App";
import { AppProviders } from "./AppProviders";

export default function AuthenticatedRoot() {
  return (
    <AppProviders>
      <App />
    </AppProviders>
  );
}
