import { demoSteps, flowLayers, type FlowLayer } from "@/content/landing";

function LayerFlow({ layer }: { layer: FlowLayer }) {
  return (
    <div className={`land-flow-layer land-flow-${layer.id}`}>
      <div className="land-flow-layer-head">
        <strong>{layer.label}</strong>
        <span>{layer.note}</span>
      </div>
      <div className="land-flow-nodes">
        {layer.nodes.map((node, index) => (
          <div className="land-flow-node" key={node.name}>
            <span className="land-flow-arrow" aria-hidden="true" hidden={index === layer.nodes.length - 1}>
              →
            </span>
            <strong>{node.name}</strong>
            <small>{node.detail}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SystemFlow() {
  return (
    <section className="land-section land-flow-section" id="how-it-works">
      <div className="land-section-intro">
        <p className="land-eyebrow">How ARGUS works</p>
        <h2>One connected safety context.</h2>
        <p>
          MAX30102 readings travel over BLE to the authenticated Trekker
          Portal. The phone adds GPS, the backend validates every write, and
          Supabase holds one shared emergency record for the Authority Portal.
        </p>
      </div>
      <div className="land-flow-grid">
        {flowLayers.map((layer) => (
          <LayerFlow key={layer.id} layer={layer} />
        ))}
      </div>
      <div className="land-internet-note">
        <strong>Internet boundary</strong>
        <p>
          The nearby wristband link uses Bluetooth Low Energy and needs no
          internet. Internet is required between the phone and the Next.js
          backend, Supabase, and WhatsApp cloud services.
        </p>
      </div>
      <div className="land-stepper">
        <div className="land-section-intro">
          <p className="land-eyebrow">Guided demo sequence</p>
          <h2>Six steps from wristband to response.</h2>
        </div>
        <ol className="land-steps">
          {demoSteps.map((step, index) => (
            <li key={step.title}>
              <span className="land-step-number">{index + 1}</span>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </li>
          ))}
        </ol>
        <p className="land-demo-note">
          Interface previews in this section are illustrative. Delivery status
          is reported only after the real backend and provider confirm it.
        </p>
      </div>
    </section>
  );
}
