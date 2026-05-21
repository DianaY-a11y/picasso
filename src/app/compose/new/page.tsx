"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { newId } from "@/lib/db";
import { StudioHeader } from "@/components/StudioHeader";

export default function NewCompositionPage() {
  const router = useRouter();

  useEffect(() => {
    const id = newId();
    router.replace(`/compose/${id}`);
  }, [router]);

  return (
    <div className="min-h-screen">
      <StudioHeader />
      <main className="w-full max-w-3xl mx-auto px-8 pt-10 pb-24">
        <div className="display-italic text-[1.4rem] text-muted">
          opening a new canvas…
        </div>
      </main>
    </div>
  );
}
