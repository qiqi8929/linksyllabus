"use client";

import { useState } from "react";

const FAQ_ITEMS = [
  {
    q: "What is Magic Log?",
    a: "Magic Log is a digital apprentice record book for Canadian trades. Log work by voice or photo, collect mentor signatures, track period progress, and export an AIT-ready submission package."
  },
  {
    q: "Which provinces are supported?",
    a: "Alberta (AIT) is fully supported today. British Columbia and Ontario are coming soon."
  },
  {
    q: "Does my mentor need an app?",
    a: "No. Mentors can sign on your device in person, or via an SMS link — no download required."
  },
  {
    q: "How does AIT submission work?",
    a: "At period end, export your 2-page package from Magic Log and upload it to MyTradesecrets. Your work orders, hours, and competences stay organized by period."
  },
  {
    q: "Is Magic Log free to start?",
    a: "Yes. You get a 30-day free trial with no credit card required. After that, Magic Log is $19.99/month — cancel anytime."
  },
  {
    q: "What trades are supported?",
    a: "Electrician, Plumber, Welder, Pipefitter, Carpenter, Heavy Equipment Technician, and more. Choose your trade during onboarding."
  }
] as const;

export function MagicLogLandingFaq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="ml-faq-list">
      {FAQ_ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className={`ml-faq-item ${isOpen ? "ml-faq-item--open" : ""}`}>
            <button
              type="button"
              className="ml-faq-trigger"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <span>{item.q}</span>
              <span className="ml-faq-toggle" aria-hidden>
                {isOpen ? "−" : "+"}
              </span>
            </button>
            {isOpen ? <p className="ml-faq-answer">{item.a}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
