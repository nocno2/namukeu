import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminNav from "@/components/AdminNav";
import Editor from "@/components/Editor";

export default async function NewPostPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <AdminNav />
      <h1 className="text-2xl font-bold mb-6">새 글 작성</h1>
      <Editor />
    </div>
  );
}
