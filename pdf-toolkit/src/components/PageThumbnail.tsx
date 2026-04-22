import type { PdfPage } from "../lib/types";

type PageThumbnailProps = {
  page: PdfPage;
};

export default function PageThumbnail({ page }: PageThumbnailProps) {
  return (
    <img
      className="page-thumbnail-image"
      src={page.thumbnail}
      alt={`Sayfa ${page.pageIndex + 1}`}
    />
  );
}
