// A person's photo, or their initials when there is none. The box has a fixed size from the
// first paint, so nothing moves when the photo arrives, and photos load lazily. Photos exist for
// the four seed users (public/avatars), found by first name, at 64 and 128 pixels, and the
// browser picks the file that fits the size and the screen's pixel density.
import { clsx } from "clsx";
import { useState } from "react";
import { initials } from "@/lib/format";
import styles from "./Avatar.module.css";

const PHOTOS = new Set(["ada", "grace", "linus", "margaret"]);

interface AvatarProps {
  name: string;
  size?: 24 | 32 | 48 | 64;
  className?: string;
}

export function Avatar({ name, size = 32, className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const photo = name.split(" ")[0]!.toLowerCase();
  const dimensions = { width: size, height: size };

  if (failed || !PHOTOS.has(photo)) {
    return (
      <span data-ui="avatar" role="img" aria-label={name} className={clsx(styles.avatar, styles.initials, className)} style={{ ...dimensions, fontSize: size * 0.4 }}>
        {initials(name)}
      </span>
    );
  }
  return (
    <img
      data-ui="avatar"
      className={clsx(styles.avatar, className)}
      src={`/avatars/${photo}-64.webp`}
      srcSet={`/avatars/${photo}-64.webp 64w, /avatars/${photo}-128.webp 128w`}
      sizes={`${size}px`}
      alt={name}
      {...dimensions}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
