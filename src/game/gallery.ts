// The photograph collection (user 2026-07-20): every print, poster, and
// photograph the diver has actually looked at in the world files itself
// here, and the pause menu shows the collection. The three tin divers add
// their own polaroids when wound. Per-run, like the tape list — the site
// keeps nothing between shifts.

export interface GalleryItem {
  id: string;
  title: string;
  url: string; // data-url or served file — whatever the inspect showed
  caption: string;
}

class Gallery {
  readonly items: GalleryItem[] = [];

  /** File a print. Returns true only the FIRST time (callers may toast). */
  unlock(item: GalleryItem): boolean {
    if (this.items.some((i) => i.id === item.id)) return false;
    this.items.push(item);
    return true;
  }
}

export const GALLERY = new Gallery();
