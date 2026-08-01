import { existsSync } from "node:fs";
import { join } from "node:path";
import Image from "next/image";
import { demoSteps } from "@/content/landing";

const videoUrl = "/demo/argus-demo.mp4";
const posterUrl = "/demo/argus-demo-poster.webp";
const gifUrl = "/demo/argus-demo.gif";

const videoFile = "demo/argus-demo.mp4";
const posterFile = "demo/argus-demo-poster.webp";
const gifFile = "demo/argus-demo.gif";

export function DemoMedia() {
  const publicDirectory = join(process.cwd(), "public");
  const hasVideo = existsSync(join(publicDirectory, videoFile));
  const hasPoster = existsSync(join(publicDirectory, posterFile));
  const hasGif = existsSync(join(publicDirectory, gifFile));

  return (
    <section className="land-demo" id="demo" aria-labelledby="demo-title">
      <div className="land-demo-heading">
        <p className="land-eyebrow">Product demonstration</p>
        <h2 id="demo-title">See the full ARGUS workflow.</h2>
        <p>From the first BLE connection to the alert received on the rescue side.</p>
      </div>

      <div className="land-demo-layout">
        <div className="land-media-frame">
          {hasVideo ? (
            <video
              controls
              playsInline
              preload="none"
              poster={hasPoster ? posterUrl : undefined}
              aria-label="ARGUS system demonstration video"
            >
              <source src={videoUrl} type="video/mp4" />
              Your browser does not support embedded video.
            </video>
          ) : hasGif || hasPoster ? (
            <Image
              src={hasGif ? gifUrl : posterUrl}
              alt="ARGUS system demonstration"
              fill
              sizes="(max-width: 900px) 100vw, 66vw"
              unoptimized={hasGif}
            />
          ) : (
            <div className="land-media-placeholder">
              <div className="land-placeholder-landscape" aria-hidden="true">
                <span className="land-placeholder-route" />
                <span className="land-placeholder-pin" />
                <span className="land-placeholder-device" />
                <span className="land-placeholder-phone" />
              </div>
              <div className="land-play-mark" aria-hidden="true"><span /></div>
              <strong>ARGUS system demo</strong>
              <p>Replace with <code>/public/demo/argus-demo.mp4</code></p>
            </div>
          )}
          <span className="land-media-badge">Project demo</span>
        </div>

        <ol className="land-demo-steps">
          {demoSteps.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
