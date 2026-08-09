import { Layout } from "./Layout";

export type LegalDocument = "privacy" | "terms";

const EFFECTIVE_DATE = "August 9, 2026";

function HomeLink() {
  return (
    <a className="btn btn-secondary legal-home-link" href="/">
      Back to OpenEscrow
    </a>
  );
}

function PolicyLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function PrivacyPolicy() {
  return (
    <article className="legal-document" aria-labelledby="privacy-policy-title">
      <header className="legal-document-heading">
        <p className="eyebrow">OpenEscrow legal</p>
        <h2 id="privacy-policy-title">Privacy Policy</h2>
        <p className="legal-effective-date">Effective and last updated: {EFFECTIVE_DATE}</p>
        <p className="legal-lede">
          This policy explains how the OpenEscrow project handles information through the hosted
          Base Sepolia testnet application at <strong>openescrow.io</strong>. It does not govern an
          independently self-hosted copy, a third-party site, or the public Base network itself.
        </p>
      </header>

      <aside className="legal-callout">
        <strong>Testnet only—do not enter real tenancy information.</strong>
        <p>
          Use invented names, addresses, documents, photographs, and payment details. This policy
          describes the prototype&apos;s current data handling; it does not authorize use with real
          tenants, real deposits, or production records.
        </p>
      </aside>

      <section>
        <h3>1. Who operates the hosted prototype</h3>
        <p>
          OpenEscrow is an independent, open-source project created and maintained by Omri Gross.
          It is not a government service, bank, law firm, or licensed escrow provider. For a
          privacy question or request, email{" "}
          <a href="mailto:privacy@openescrow.io">privacy@openescrow.io</a>. If email delivery is
          unavailable during the testnet pilot, use the private contact options on{" "}
          <PolicyLink href="https://linktr.ee/omslice">Omri&apos;s contact page</PolicyLink>. Do not
          put personal information or private agreement details in a public GitHub issue.
        </p>
      </section>

      <section>
        <h3>2. Information the hosted prototype handles</h3>
        <ul>
          <li>
            <strong>Account and identity information:</strong> Privy user identifier, sign-in
            method, name, email address, and linked wallet information received through Google,
            Privy, or a wallet provider.
          </li>
          <li>
            <strong>Agreement information:</strong> participant names and emails, roles, proposal
            terms, property-address searches and validated locations, compliance snapshots,
            deadlines, deposit amounts and shares, claims, decisions, notes, and lifecycle events.
          </li>
          <li>
            <strong>Evidence:</strong> test images or PDFs, file type and size, cryptographic digest,
            encryption metadata, and the agreement and participant role associated with the file.
          </li>
          <li>
            <strong>Wallet and blockchain information:</strong> public wallet addresses,
            transaction hashes and receipts, contract events, test-token balances, and public Base
            Sepolia activity needed to verify agreement actions.
          </li>
          <li>
            <strong>Notification information:</strong> email address, notification preferences,
            privacy-minimal message content, delivery identifiers, timestamps, and delivery,
            bounce, complaint, or suppression status.
          </li>
          <li>
            <strong>Technical information:</strong> request time and path, error category and
            correlation identifier, Cloudflare service logs, and a one-way hash of the requesting
            IP address used for abuse controls. Raw request bodies, authorization headers, and
            invitation tokens are intentionally excluded from application error logs.
          </li>
          <li>
            <strong>Browser information:</strong> essential sign-in state, short-lived invitation
            and record-session state, archive and interface preferences, and temporary form or
            transaction-recovery state stored by the browser or authentication provider.
          </li>
          <li>
            <strong>Communications:</strong> information you include when contacting the project.
          </li>
        </ul>
        <p>
          Agreement information may be supplied by another participant—for example, a landlord
          may enter a tenant&apos;s name and email before sending an invitation. Public blockchain data
          and official compliance-source information are obtained from public sources.
        </p>
      </section>

      <section>
        <h3>3. What is public and what is private</h3>
        <p>
          Base Sepolia is a public test network. Wallet addresses, transaction identifiers,
          amounts, deadlines, state changes, cryptographic hashes, and opaque evidence references
          written to a contract are public and effectively permanent. Public blockchain records
          cannot be edited or erased by OpenEscrow.
        </p>
        <p>
          Names, emails, physical addresses, private notes, invoices, photographs, and raw evidence
          files are not intended to be written to the public contract. The hosted prototype keeps
          those records in private Cloudflare D1/R2 storage, but authorized landlords, tenants, and
          any appointed arbiter may see information in their shared agreement record. A
          cryptographic hash can confirm whether bytes changed; it does not prove that the content
          is true, complete, lawful, or authored by a particular person.
        </p>
      </section>

      <section>
        <h3>4. How information is used</h3>
        <ul>
          <li>authenticate users and connect the correct agreement role and wallet;</li>
          <li>create, revise, fund, administer, archive, export, and verify test agreements;</li>
          <li>validate addresses and apply the selected compliance-profile snapshot;</li>
          <li>store and deliver authorized test evidence and record exports;</li>
          <li>send requested invitations, activity notices, and deadline reminders;</li>
          <li>verify blockchain receipts and provide a shared timestamped history;</li>
          <li>prevent abuse, diagnose failures, protect users, and maintain service readiness;</li>
          <li>respond to requests and comply with applicable legal obligations; and</li>
          <li>improve the prototype using privacy-minimized test and operational information.</li>
        </ul>
        <p>
          OpenEscrow does not sell personal information, share it for cross-context behavioral
          advertising, run targeted advertising, or use it to make decisions producing legal or
          similarly significant effects.
        </p>
      </section>

      <section>
        <h3>5. When information is disclosed</h3>
        <p>Information is disclosed only as needed for the following recipients and purposes:</p>
        <ul>
          <li>
            <strong>Other authorized agreement participants</strong> receive the shared proposal,
            agreement, claim, evidence, and record information needed for their role.
          </li>
          <li>
            <strong>Cloudflare</strong> provides the website, Worker, D1 database, private R2 object
            storage, traffic security, and service logs. See the{" "}
            <PolicyLink href="https://www.cloudflare.com/privacypolicy/">
              Cloudflare Privacy Policy
            </PolicyLink>.
          </li>
          <li>
            <strong>Privy, Google, and wallet providers</strong> provide account authentication,
            linked-account information, wallets, and wallet connections under their own policies.
            See the <PolicyLink href="https://www.privy.io/privacy-policy">Privy Privacy Policy</PolicyLink>{" "}
            and <PolicyLink href="https://policies.google.com/privacy">Google Privacy Policy</PolicyLink>.
          </li>
          <li>
            <strong>Resend and recipient email providers</strong> process recipient addresses,
            privacy-minimal message content, and delivery events. See the{" "}
            <PolicyLink href="https://resend.com/legal/privacy-policy">Resend Privacy Policy</PolicyLink>.
          </li>
          <li>
            <strong>Photon/Komoot and OpenStreetMap</strong> receive an address search query to
            return suggestions. Do not search for a real residence in this prototype. See the{" "}
            <PolicyLink href="https://www.komoot.com/privacy">Komoot Privacy Policy</PolicyLink> and{" "}
            <PolicyLink href="https://osmfoundation.org/wiki/Privacy_Policy">
              OpenStreetMap Foundation Privacy Policy
            </PolicyLink>.
          </li>
          <li>
            <strong>Base Sepolia and public RPC providers</strong> receive blockchain queries and
            signed testnet transactions; data written onchain becomes public. See the{" "}
            <PolicyLink href="https://docs.base.org/privacy-policy">Base Privacy Policy</PolicyLink>.
          </li>
          <li>
            <strong>Legal and safety recipients</strong> may receive information if reasonably
            necessary to comply with law, protect rights or safety, investigate abuse, or respond
            to valid legal process.
          </li>
        </ul>
        <p>
          The current hosted deployment uses private R2 for evidence. If a future deployment enables
          the optional encrypted-IPFS mode, encrypted ciphertext may be publicly retrievable and
          third-party gateway or pinning providers will process it; the policy will be updated
          before that mode is offered to public users.
        </p>
      </section>

      <section>
        <h3>6. Retention and deletion</h3>
        <p>
          The prototype currently retains proposals, finalized agreement records, evidence,
          notification delivery records, and lifecycle events for service operation, record
          integrity, security testing, dispute history, and applicable legal obligations. A final
          category-by-category retention schedule and automatic privacy-deletion workflow have not
          yet been approved. That is another reason not to enter real information.
        </p>
        <p>
          Account-derived record sessions expire after 24 hours and can be revoked from Account &amp;
          Settings. Hashed rate-limit records older than 48 hours are scheduled for deletion.
          Browser session data normally clears with the browser session; browser preferences may
          remain until cleared. Other providers retain information under their policies. Public
          blockchain data cannot be erased. Shared records, legal holds, security needs, another
          participant&apos;s rights, and technical limits may restrict a deletion request.
        </p>
      </section>

      <section>
        <h3>7. Your choices and requests</h3>
        <ul>
          <li>turn optional activity and deadline emails on or off in Account &amp; Settings;</li>
          <li>archive or restore a record in your view (archiving does not delete it);</li>
          <li>download the account metadata inventory and authorized agreement record exports;</li>
          <li>revoke OpenEscrow record sessions and sign out; and</li>
          <li>
            request access, correction, deletion, restriction, or another right available under
            applicable law by contacting <a href="mailto:privacy@openescrow.io">privacy@openescrow.io</a>.
          </li>
        </ul>
        <p>
          A request must identify the account and role sufficiently for verification. OpenEscrow
          may ask you to verify the same email or wallet used with the service and will not disclose
          another participant&apos;s private information. The project will explain if a request cannot
          be completed because of shared-record integrity, public blockchain permanence, a legal
          obligation, or another applicable exception. You will not be discriminated against for
          exercising an applicable privacy right.
        </p>
      </section>

      <section>
        <h3>8. Cookies, browser signals, and third-party collection</h3>
        <p>
          OpenEscrow uses only essential browser storage and authentication technologies needed for
          sign-in, security, preferences, invitation recovery, and transaction recovery. The
          project does not currently use advertising cookies or cross-site behavioral analytics.
          Blocking essential storage may prevent sign-in or recovery features from working.
        </p>
        <p>
          Because OpenEscrow does not track users across unrelated sites or sell/share personal
          information for behavioral advertising, it does not currently take a separate action in
          response to a browser Do Not Track signal or Global Privacy Control signal. Authentication,
          wallet, infrastructure, email, geocoding, and linked-site providers may collect information
          under their own policies when you interact with them.
        </p>
      </section>

      <section>
        <h3>9. Security</h3>
        <p>
          OpenEscrow uses HTTPS, role-bound authorization, private storage, encryption for hosted
          evidence, content-type and integrity checks, rate limits, secret-free public URLs, and
          transaction-receipt verification. No internet service, wallet, smart contract, or storage
          system is completely secure. Protect your browser, email account, wallet, private keys,
          recovery material, and invitation links. Never send a private key or seed phrase to
          OpenEscrow.
        </p>
      </section>

      <section>
        <h3>10. Children and geographic scope</h3>
        <p>
          The hosted prototype is intended only for adults who are at least 18 years old. It is not
          directed to children, and OpenEscrow does not knowingly collect personal information from
          anyone under 13. Contact the project if you believe a child supplied information so it can
          be investigated and removed where possible. The pilot is designed for U.S. test use;
          service providers may process information in the United States and other locations under
          their policies.
        </p>
      </section>

      <section>
        <h3>11. Changes to this policy</h3>
        <p>
          The policy may change as the prototype changes. The effective date at the top will be
          updated, and a material change will be announced conspicuously in the application or by
          email when appropriate. The current policy remains available at{" "}
          <a href="https://openescrow.io/privacy">openescrow.io/privacy</a>.
        </p>
      </section>
    </article>
  );
}

function TermsOfUse() {
  return (
    <article className="legal-document" aria-labelledby="terms-of-use-title">
      <header className="legal-document-heading">
        <p className="eyebrow">OpenEscrow legal</p>
        <h2 id="terms-of-use-title">Terms of Use</h2>
        <p className="legal-effective-date">Effective and last updated: {EFFECTIVE_DATE}</p>
        <p className="legal-lede">
          These terms govern the hosted Base Sepolia testnet application at{" "}
          <strong>openescrow.io</strong>. By selecting a sign-in method, creating or opening an
          agreement, or otherwise using the hosted application, you agree to these terms and
          acknowledge the <a href="/privacy">Privacy Policy</a>.
        </p>
      </header>

      <aside className="legal-callout">
        <strong>This is not a live escrow product.</strong>
        <p>
          OpenEscrow is a public testnet prototype using worthless test tokens. Do not use it for a
          real tenancy, real security deposit, legally required notice, or real dispute.
        </p>
      </aside>

      <section>
        <h3>1. Eligibility and authority</h3>
        <p>
          You must be at least 18 years old and legally able to agree to these terms. If you use the
          hosted application for an organization, you represent that you are authorized to bind
          that organization. Do not use OpenEscrow where use would violate applicable law,
          sanctions, a court order, or another binding obligation.
        </p>
      </section>

      <section>
        <h3>2. Prototype boundaries</h3>
        <p>
          OpenEscrow is independent open-source software. It is not a bank, money transmitter,
          custodian, broker, investment adviser, insurer, law firm, court, government service,
          licensed escrow company, property manager, or substitute for a lease, statutory notice,
          legal process, or professional advice. No attorney-client, fiduciary, trustee,
          landlord-tenant, agency, or escrow relationship is created between you and the project.
        </p>
        <p>
          Compliance profiles and deadlines are research-based test aids, not legal determinations.
          Laws and local rules change, automated sources can fail, and the correct rule depends on
          facts the application may not know. Each participant remains responsible for obtaining
          qualified advice and complying with applicable law.
        </p>
      </section>

      <section>
        <h3>3. Test information only</h3>
        <p>
          Use only invented names, email addresses you control, test property addresses, and test
          files. Do not upload a real lease, identity document, invoice, receipt, photograph,
          financial information, confidential communication, regulated record, unlawful content,
          malware, or material you lack authority to use. You are responsible for the content you
          provide and for obtaining any permission needed from another participant.
        </p>
      </section>

      <section>
        <h3>4. Agreements and participant responsibilities</h3>
        <p>
          A proposal or record in OpenEscrow documents what test participants entered and what
          supported systems recorded. OpenEscrow is not a party to an agreement, does not verify a
          participant&apos;s identity or authority beyond the implemented sign-in and wallet checks,
          and does not decide whether an agreement, claim, notice, signature, or outcome is valid or
          enforceable. Participants are responsible for reviewing terms, wallet addresses, roles,
          amounts, deadlines, evidence, and transaction details before approving or signing.
        </p>
        <p>
          Invitation and record links may grant access to private test information. Keep them
          confidential, send them only to the intended participant, and rotate or revoke access when
          appropriate. Do not attempt to access another person&apos;s account, wallet, invitation, or
          agreement record.
        </p>
      </section>

      <section>
        <h3>5. Wallets, test tokens, and blockchain risks</h3>
        <p>
          You control your wallet and are responsible for its security, keys, recovery material,
          permissions, and transactions. OpenEscrow does not take custody of wallet keys. Blockchain
          transactions can be public, irreversible, delayed, reordered, rejected, or affected by
          software defects, network congestion, forks, provider outages, compromised wallets, or
          smart-contract vulnerabilities. Verify transaction details in your wallet before signing.
        </p>
        <p>
          Base Sepolia assets have no intended monetary value. Any displayed funding, sponsored gas,
          stablecoin, yield-bearing asset, on-ramp, swap, interest, or yield feature is a test,
          simulation, restricted candidate, or future concept unless the interface expressly says
          otherwise. No return, principal protection, liquidity, redemption, rate, eligibility, or
          availability is promised.
        </p>
      </section>

      <section>
        <h3>6. Public and private records</h3>
        <p>
          Information written to Base Sepolia—including wallet addresses, amounts, deadlines,
          transaction identifiers, state changes, hashes, and opaque pointers—is public and
          effectively permanent. Do not place personal or confidential content onchain or at an
          unencrypted public URL. Hosted evidence is intended to remain offchain and access
          controlled, but no security measure is perfect. A timestamp or hash proves only the
          recorded bytes and time; it does not prove truth, legality, authorship, delivery, or
          compliance.
        </p>
      </section>

      <section>
        <h3>7. Acceptable use</h3>
        <p>You may not use the hosted application to:</p>
        <ul>
          <li>violate law, sanctions, privacy, intellectual-property, or contractual rights;</li>
          <li>misrepresent identity, authority, a legal requirement, or an onchain result;</li>
          <li>harass, threaten, discriminate against, deceive, or exploit another person;</li>
          <li>send spam or invitations to people without an appropriate relationship or permission;</li>
          <li>probe, bypass, overload, disrupt, scrape, or compromise access or security controls;</li>
          <li>introduce malware, automated abuse, or harmful content; or</li>
          <li>use the prototype to hold, transfer, or administer real rental-deposit funds.</li>
        </ul>
        <p>
          Access may be limited or suspended to protect users, the service, or the public project;
          comply with law; investigate abuse; or maintain the testnet boundary.
        </p>
      </section>

      <section>
        <h3>8. Open-source code and user content</h3>
        <p>
          The OpenEscrow source code is offered under the MIT License in the{" "}
          <PolicyLink href="https://github.com/omslice/OpenEscrow">project repository</PolicyLink>.
          The license—not these hosted-service terms—governs copying, modifying, distributing, or
          self-hosting the code. A person operating a self-hosted version is an independent operator
          responsible for that deployment, its policies, security, legal compliance, and data.
        </p>
        <p>
          You retain rights you have in content you submit. You grant the project a limited,
          nonexclusive license to host, encrypt, process, transmit, reproduce, and display that
          content only as reasonably needed to operate, secure, support, and test the service and to
          comply with law. You represent that you have the rights and permissions necessary to
          provide it.
        </p>
      </section>

      <section>
        <h3>9. Third-party services and links</h3>
        <p>
          The application depends on or links to independent services, including Cloudflare, Privy,
          Google, wallet providers, Resend, Photon/Komoot, OpenStreetMap, Base, public RPC providers,
          block explorers, and project/social sites. Their terms, privacy policies, availability,
          security, and decisions are their responsibility. OpenEscrow does not control or endorse
          third-party content merely by linking to it.
        </p>
      </section>

      <section>
        <h3>10. Changes, availability, and termination</h3>
        <p>
          The prototype may change, pause, reset, lose test data, discontinue a feature, or stop
          operating at any time. No uptime, support, preservation, compatibility, or recovery
          commitment is made. Keep your own authorized exports and independently verify important
          public testnet receipts. You may stop using the service at any time and can revoke
          OpenEscrow-derived record sessions from Account &amp; Settings.
        </p>
      </section>

      <section>
        <h3>11. Disclaimers</h3>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE HOSTED APPLICATION, CODE, CONTRACTS, CONTENT,
          COMPLIANCE RESEARCH, AND RELATED SERVICES ARE PROVIDED “AS IS” AND “AS AVAILABLE,” WITHOUT
          WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, SECURITY, AVAILABILITY, ACCURACY, OR LEGAL
          COMPLIANCE. Nothing in these terms excludes a warranty or right that cannot lawfully be
          excluded.
        </p>
      </section>

      <section>
        <h3>12. Limitation of liability</h3>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE OPENESCROW PROJECT AND ITS CONTRIBUTORS WILL
          NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE
          DAMAGES, OR FOR LOST DATA, LOST FUNDS, LOST PROFITS, LOST OPPORTUNITY, OR LOSS OF GOODWILL,
          ARISING FROM OR RELATED TO THE HOSTED APPLICATION OR CODE. TO THE MAXIMUM EXTENT PERMITTED
          BY LAW, THEIR TOTAL LIABILITY FOR ALL CLAIMS RELATING TO THE HOSTED APPLICATION WILL NOT
          EXCEED THE GREATER OF US$100 OR THE AMOUNT YOU PAID DIRECTLY TO THE PROJECT FOR THE HOSTED
          SERVICE DURING THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM. Donations are not
          payment for the hosted service. These limits do not apply where prohibited by law.
        </p>
      </section>

      <section>
        <h3>13. Disputes and applicable law</h3>
        <p>
          No mandatory arbitration, class-action waiver, or project-selected choice-of-law clause
          is imposed by this testnet version of the terms. Applicable law and the jurisdiction of a
          court with authority govern any dispute. Before filing a claim, you and the project should
          make a reasonable effort to resolve it through the contact process below, unless urgent
          relief or law requires otherwise.
        </p>
      </section>

      <section>
        <h3>14. Changes and contact</h3>
        <p>
          Terms may change as the prototype changes. The date at the top will be updated, and a
          material change will be announced conspicuously in the application or by email when
          appropriate. Continued use after the effective date of revised terms means you accept the
          revised terms; if you do not agree, stop using the hosted application.
        </p>
        <p>
          For a terms, safety, or legal question, contact{" "}
          <a href="mailto:privacy@openescrow.io">privacy@openescrow.io</a> or use the private
          contact options on{" "}
          <PolicyLink href="https://linktr.ee/omslice">Omri&apos;s contact page</PolicyLink>. Do not
          send wallet keys, seed phrases, bearer links, or private evidence by email.
        </p>
      </section>
    </article>
  );
}

export function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <Layout showNotifications={false} accountEntry={<HomeLink />}>
      {document === "privacy" ? <PrivacyPolicy /> : <TermsOfUse />}
    </Layout>
  );
}
