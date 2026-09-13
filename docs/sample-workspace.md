# Signed-out sample workspace

The normal About landing page remains the default at `/`. Its **Try the testnet demo**
button opens the existing sign-in section, **View on GitHub** opens the source repository,
and **Try the mock demo** opens `/explore`. The existing `/demo` overview video and the
real sign-in and wallet flows remain available.

Visitors start as fictional landlord Morgan Reed. Tenant view shows only Avery
Chen’s two sample agreements. Dashboard, Proposals, Deposits, Record, and About
use the normal workspace vocabulary and shared visual styles. Documents open as
fictional previews.

Try these local flows:

- Willow Court: approve as Avery, finalize as Morgan, then fund as Avery.
- Cedar Studio: review the invoice, accept the deduction as Avery, then withdraw
  each party’s allocation in their respective view. Alternatively, reset and
  dispute the deduction; that example pauses for resolution.
- Birch Place: inspect a completed full refund and its sample transaction history.

`SampleWorkspace` mounts before account activation and invitation recovery. It
does not mount the live workspace, authentication provider, or wallet providers.
The sample model uses display-only `SAMPLE-*` references and React memory only:
no account API, browser storage, wallet signature, file upload, or message delivery.
Reset creates fresh fixtures. Sign in / connect exits to the normal landing page;
sample records are never converted into live records. Dates are a fixed fictional
snapshot, not a live deadline service.

Run `npm run test:sample-workspace` in `frontend` for browser coverage of navigation,
documents, keyboard access, simulated actions, reset/reload, 320px and 375px layouts,
storage/API/wallet isolation, and sign-in. The check also runs in `npm run check`.
`src/lib/sampleData.test.ts` verifies role guards, immutable fixtures, replay-safe
actions, disputed-fund guards, and balance reconciliation.
