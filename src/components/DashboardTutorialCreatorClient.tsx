"use client";

import dynamic from "next/dynamic";

const TutorialCreator = dynamic(
  () => import("./TutorialCreator").then((m) => ({ default: m.TutorialCreator })),
  {
    ssr: false,
    loading: () => (
      <div className="card p-6 text-sm text-zinc-600">Loading tutorial editor…</div>
    )
  }
);

export function DashboardTutorialCreatorClient(props: {
  guideCount?: number;
  paidGuideSlots?: number;
}) {
  const gc = Number(props.guideCount);
  const ps = Number(props.paidGuideSlots);
  return (
    <TutorialCreator
      guideCount={Number.isFinite(gc) && gc >= 0 ? gc : 0}
      paidGuideSlots={Number.isFinite(ps) && ps >= 0 ? ps : 0}
    />
  );
}
