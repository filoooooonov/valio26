import { useRef, useState } from "react";
import { Icon } from "../icons";

// The request box sits at the top of the cart. Photo: the gateway has no image endpoint yet, so the
// button accepts a photo and says plainly that reading menus from photos is coming soon.
export function RequestBox(props: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  hasCart: boolean;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  return (
    <div className="reqwrap">
      <form
        className="req"
        onSubmit={(e) => {
          e.preventDefault();
          if (!props.busy) props.onSubmit();
        }}
      >
        <Icon name="sparkle" size={26} className="req__icon" />
        <textarea
          className="req__input"
          value={props.value}
          rows={3}
          aria-label="What do you need?"
          placeholder="What do you need? e.g. ingredients for a catering event for 50 people on Saturday"
          onChange={(e) => props.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!props.busy) props.onSubmit();
            }
          }}
        />
        <button
          type="button"
          className="btn-ghost"
          onClick={() => file.current?.click()}
          disabled={props.busy}
        >
          <Icon name="camera" size={20} /> Photo
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPhoto(f.name);
            e.target.value = "";
          }}
        />
        <button
          type="submit"
          className="button button--outline req__go"
          disabled={props.busy || !props.value.trim()}
        >
          {props.busy
            ? "Working…"
            : props.hasCart
              ? "Update cart"
              : "Build cart"}
        </button>
      </form>
      {photo && (
        <p className="req__photo" role="status">
          <Icon name="info" size={16} /> <b>{photo}</b>: reading a menu from a
          photo is coming soon. Type the dishes for now.
          <button
            type="button"
            className="linkbtn"
            onClick={() => setPhoto(null)}
          >
            Dismiss
          </button>
        </p>
      )}
    </div>
  );
}
