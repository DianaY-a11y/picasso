"use client";

import { use } from "react";
import dynamic from "next/dynamic";
import { StudioHeader } from "@/components/StudioHeader";

const Composer = dynamic(
  () => import("@/components/Composer").then((m) => m.Composer),
  { ssr: false },
);

export default function ComposePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <div className="min-h-screen">
      <StudioHeader />
      <Composer id={id} />
    </div>
  );
}
