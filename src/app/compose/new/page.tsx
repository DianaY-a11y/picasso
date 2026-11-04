import { redirect } from "next/navigation";

// The composition studio now opens as an overlay on the scrapbook.
export default function NewCompositionPage() {
  redirect("/?compose=new");
}
