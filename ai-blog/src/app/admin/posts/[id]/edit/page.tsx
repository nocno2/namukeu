import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminNav from "@/components/AdminNav";
import Editor from "@/components/Editor";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditPostPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const { id } = await params;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <AdminNav />
      <h1 className="text-2xl font-bold mb-6">글 수정</h1>
      <Editor postId={parseInt(id)} />
    </div>
  );
}
