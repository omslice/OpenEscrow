import { Layout } from "./Layout";

function HomeLink() {
  return (
    <a className="btn btn-secondary legal-home-link" href="/">
      Back to OpenEscrow
    </a>
  );
}

export function DemoPage() {
  return (
    <Layout showNotifications={false} accountEntry={<HomeLink />}>
      <article className="demo-page" aria-labelledby="demo-page-title">
        <header className="demo-page-heading">
          <p className="eyebrow">One-minute overview</p>
          <h2 id="demo-page-title">Get to know OpenEscrow</h2>
          <p id="demo-page-description">
            A quick introduction to what OpenEscrow is, why it was created, and how it helps
            landlords and tenants manage rental security deposits more clearly.
          </p>
        </header>
        <video
          controls
          playsInline
          preload="metadata"
          poster="/og.png"
          aria-describedby="demo-page-description"
        >
          <source src="/openescrow-demo.mp4" type="video/mp4" />
          Your browser cannot play this video. You can{" "}
          <a href="/openescrow-demo.mp4">open the OpenEscrow overview directly</a>.
        </video>
      </article>
    </Layout>
  );
}
