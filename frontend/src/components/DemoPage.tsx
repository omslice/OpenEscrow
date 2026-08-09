import { useEffect } from "react";

export function DemoPage() {
  useEffect(() => {
    document.documentElement.classList.add("demo-route");
    return () => document.documentElement.classList.remove("demo-route");
  }, []);

  return (
    <main className="demo-only-page" aria-label="OpenEscrow demo">
      <video
        aria-label="OpenEscrow demo video"
        controls
        playsInline
        preload="metadata"
        poster="/og.png"
      >
        <source src="/openescrow-demo.mp4" type="video/mp4" />
        Your browser cannot play this video. You can{" "}
        <a href="/openescrow-demo.mp4">open the OpenEscrow demo directly</a>.
      </video>
    </main>
  );
}
