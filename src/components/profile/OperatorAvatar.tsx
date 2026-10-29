"use client";

import type { CSSProperties } from "react";

export const AVATAR_CHOICES = [
  { id: "muse", label: "Muse", position: "0% 0%" },
  { id: "forge", label: "Forge", position: "50% 0%" },
  { id: "ember", label: "Ember", position: "100% 0%" },
  { id: "orbit", label: "Orbit", position: "0% 100%" },
  { id: "sage", label: "Sage", position: "50% 100%" },
  { id: "arc", label: "Arc", position: "100% 100%" },
] as const;

export type AvatarChoice = (typeof AVATAR_CHOICES)[number]["id"];

type OperatorAvatarProps = {
  choice?: string | null;
  imageUrl?: string | null;
  alt: string;
  className?: string;
};

export function OperatorAvatar({ choice, imageUrl, alt, className = "" }: OperatorAvatarProps) {
  if (imageUrl) return <img src={imageUrl} alt={alt} className={`object-cover ${className}`} />;
  const selected = AVATAR_CHOICES.find((avatar) => avatar.id === choice) || AVATAR_CHOICES[0];
  const style: CSSProperties = {
    backgroundImage: "url('/images/operator-avatar-sheet.jpg')",
    backgroundSize: "300% 200%",
    backgroundPosition: selected.position,
  };
  return <span role="img" aria-label={alt} className={`block bg-[var(--sand)] ${className}`} style={style} />;
}
