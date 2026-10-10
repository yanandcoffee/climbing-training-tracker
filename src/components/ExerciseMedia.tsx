import type { Exercise } from "../types";

function youtubeEmbed(url: string): string | null {
  const m =
    url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/) ||
    url.match(/youtube\.com\/embed\/([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

function inferType(ex: Pick<Exercise, "mediaUrl" | "mediaType">): "image" | "video" | null {
  if (!ex.mediaUrl) return null;
  if (ex.mediaType) return ex.mediaType;
  if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(ex.mediaUrl)) return "image";
  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(ex.mediaUrl) || youtubeEmbed(ex.mediaUrl))
    return "video";
  return "image";
}

/** Full media viewer for the exercise detail screen. */
export function ExerciseMediaView({
  ex,
}: {
  ex: Pick<Exercise, "mediaUrl" | "mediaType" | "name">;
}) {
  if (!ex.mediaUrl) return null;
  const type = inferType(ex);
  const yt = youtubeEmbed(ex.mediaUrl);

  if (type === "video" && yt) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
        <iframe
          src={yt}
          title={ex.name}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  if (type === "video") {
    return (
      <video
        src={ex.mediaUrl}
        controls
        playsInline
        className="w-full rounded-xl bg-black"
      />
    );
  }
  return (
    <img
      src={ex.mediaUrl}
      alt={`Reference for ${ex.name}`}
      className="w-full rounded-xl object-contain"
    />
  );
}

/** Small tappable thumbnail for checklist rows. */
export function ExerciseMediaThumb({
  ex,
  onClick,
}: {
  ex: Pick<Exercise, "mediaUrl" | "mediaType" | "name">;
  onClick?: () => void;
}) {
  if (!ex.mediaUrl) return null;
  const type = inferType(ex);
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
      aria-label={`View form for ${ex.name}`}
    >
      {type === "image" ? (
        <img src={ex.mediaUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-lg">
          ▶️
        </span>
      )}
    </button>
  );
}
