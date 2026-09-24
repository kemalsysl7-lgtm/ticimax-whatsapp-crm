import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { TemplateEditor } from "../template-editor";
import { TestMessageForm } from "./test-message-form";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [templates, triggers] = await Promise.all([api.templates(), api.triggers()]);
  const template = templates.find((t) => t.id === Number(id));
  if (!template) notFound();

  return (
    <div className="space-y-6">
      <TemplateEditor triggers={triggers} initial={template} />
      {template.status === "approved" && (
        <TestMessageForm templateName={template.name} variables={triggers[template.trigger]?.variables ?? []} />
      )}
    </div>
  );
}
