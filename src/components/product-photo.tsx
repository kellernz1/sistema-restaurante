"use client";

import Image from "next/image";
import { UtensilsCrossed } from "lucide-react";
import { useState } from "react";

export function ProductPhoto({ id, version, name }: { id: string; version?: string | null; name: string }) {
  const [failedVersion, setFailedVersion] = useState<string | null>(null);
  if (!version || failedVersion === version) return <div className="product-placeholder" aria-hidden="true"><UtensilsCrossed size={72} strokeWidth={1} /></div>;
  return <Image className="product-photo" src={`/api/public/products/${id}/image?v=${version}`} alt={name}
    width={1200} height={900} unoptimized onError={() => setFailedVersion(version)} />;
}
