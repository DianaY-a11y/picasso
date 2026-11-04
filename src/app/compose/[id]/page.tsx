import { redirect } from "next/navigation";

// The composition studio now opens as an overlay on the scrapbook.
export default async function ComposePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/?compose=${encodeURIComponent(id)}`);
}
