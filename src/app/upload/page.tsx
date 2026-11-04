import { redirect } from "next/navigation";

// The sticker creation station now opens as an overlay on the scrapbook.
export default function UploadPage() {
  redirect("/?studio=stickers");
}
