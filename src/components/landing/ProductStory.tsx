import { productStories, type ProductStoryData } from "@/content/landing";
import {
  AuthorityPreview,
  DevicePreview,
  EmergencyPreview,
  PhonePreview,
} from "./previews";

function StoryVisual({ visual }: { visual: ProductStoryData["visual"] }) {
  if (visual === "wristband") return <DevicePreview />;
  if (visual === "trekkerPhone") return <PhonePreview />;
  if (visual === "emergencyFlow") return <EmergencyPreview />;
  return <AuthorityPreview />;
}

export function ProductStory() {
  return (
    <>
      <section className="land-section land-problem" id="about">
        <div>
          <p className="land-eyebrow">The challenge</p>
          <h2>Better context when the trail becomes an emergency.</h2>
        </div>
        <div className="land-problem-copy">
          <p>
            Trekkers can face altitude-related symptoms, difficult terrain,
            weak connectivity, delayed communication, and rescue teams that
            know too little about the person they are looking for.
          </p>
          <p>
            ARGUS connects the available safety context—wearable readings,
            phone GPS, and symptom reports—into one emergency record that
            reaches rescuers with useful information.
          </p>
        </div>
      </section>

      <section className="land-product-story">
        {productStories.map((story, index) => (
          <article
            className={`land-story-row ${index % 2 === 1 ? "land-story-reverse" : ""}`}
            id={story.id}
            key={story.id}
          >
            <div className="land-story-visual">
              <StoryVisual visual={story.visual} />
            </div>
            <div className="land-story-copy">
              <span className="land-story-number">{story.number}</span>
              <p className="land-eyebrow">{story.eyebrow}</p>
              <h2>{story.title}</h2>
              <p>{story.copy}</p>
              <ul>
                {story.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
