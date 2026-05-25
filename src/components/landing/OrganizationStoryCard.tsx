import { organizationStoryText, storyMission } from "@/lib/landing-story"

export function OrganizationStoryCard() {
  return (
    <article className="rounded-[1.45rem] border border-[#e5dfd3] bg-white/92 p-5 shadow-[0_16px_42px_rgba(43,53,35,0.09)] md:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8f4e]">
        ZHUXISHE STORY
      </p>
      <h2 className="mt-2 font-display text-3xl font-bold leading-tight md:text-4xl">
        {storyMission.title}
      </h2>
      <div className="mt-4 space-y-3 text-sm leading-[1.85] text-[#3f463c] md:text-base">
        {organizationStoryText.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </article>
  )
}
