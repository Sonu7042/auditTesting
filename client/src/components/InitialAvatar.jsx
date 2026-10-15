export const getNameInitial = (name, fallback = "U") => {
  const initial = String(name || "").trim().charAt(0);
  return (initial || fallback).toUpperCase();
};

export default function InitialAvatar({
  name,
  fallback = "U",
  className = "",
  textClassName = "",
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#343F4D] text-white ${className}`}
      aria-label={name ? `${name} avatar` : "User avatar"}
      title={name || "User"}
    >
      <span
        className={`font-semibold uppercase leading-none ${textClassName}`}
        aria-hidden="true"
      >
        {getNameInitial(name, fallback)}
      </span>
    </div>
  );
}
