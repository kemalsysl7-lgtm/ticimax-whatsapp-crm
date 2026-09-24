import { api } from "@/lib/api";
import { TemplateEditor } from "../template-editor";

export default async function NewTemplatePage() {
  const triggers = await api.triggers();
  return <TemplateEditor triggers={triggers} initial={null} />;
}
