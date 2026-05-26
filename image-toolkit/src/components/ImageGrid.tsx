import { useState } from "react";
import type { LoadedImage } from "../lib/types";
import ImageCard from "./ImageCard";

type ImageGridProps = {
  images: LoadedImage[];
  selectedImages: Set<string>;
  rotations: Record<string, number>;
  flips: Record<string, { h: boolean; v: boolean }>;
  onSelectionChange: (id: string, checked: boolean) => void;
  onReorder: (newIds: string[]) => void;
  onRotate: (id: string, direction: "cw" | "ccw") => void;
  onFlipH: (id: string) => void;
  onFlipV: (id: string) => void;
  onRemove: (id: string) => void;
  onCropRequest: (id: string) => void;
};

export default function ImageGrid({
  images,
  selectedImages,
  rotations,
  flips,
  onSelectionChange,
  onReorder,
  onRotate,
  onFlipH,
  onFlipV,
  onRemove,
  onCropRequest,
}: ImageGridProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }

    const reordered = [...images];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    onReorder(reordered.map((img) => img.id));
    setDragIndex(null);
    setDropIndex(null);
  }

  return (
    <div className="page-grid">
      {images.map((image, index) => (
        <div
          key={image.id}
          draggable
          className={dropIndex === index ? "is-drop-target" : ""}
          onDragStart={() => setDragIndex(index)}
          onDragEnd={() => { setDragIndex(null); setDropIndex(null); }}
          onDragOver={(e) => { e.preventDefault(); setDropIndex(index); }}
          onDrop={() => handleDrop(index)}
        >
          <ImageCard
            image={image}
            checked={selectedImages.has(image.id)}
            visibleIndex={index}
            rotation={rotations[image.id] ?? 0}
            flipH={flips[image.id]?.h ?? false}
            flipV={flips[image.id]?.v ?? false}
            onSelectionChange={(checked) => onSelectionChange(image.id, checked)}
            onRotate={(direction) => onRotate(image.id, direction)}
            onFlipH={() => onFlipH(image.id)}
            onFlipV={() => onFlipV(image.id)}
            onRemove={() => onRemove(image.id)}
            onCropRequest={() => onCropRequest(image.id)}
          />
        </div>
      ))}
    </div>
  );
}
