import { api } from "@/lib/api";
import { CampaignForm } from "./campaign-form";

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ segment?: string }> }) {
  const sp = await searchParams;
  const [segments, templates, triggers] = await Promise.all([api.segments(), api.templates(), api.triggers()]);
  const usable = templates.filter((t) => t.status === "approved" && t.trigger === "segment_campaign");
  return (
    <CampaignForm
      segments={segments.segments}
      templates={usable}
      variables={triggers.segment_campaign?.variables ?? []}
      initialSegment={segments.segments.some((s) => s.key === sp.segment) ? sp.segment! : "sleeping"}
    />
  );
}
